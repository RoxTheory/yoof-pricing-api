const fetch = require('node-fetch');

// Fonction pour appeler l'API de prix Azure avec un filtre spécifique
async function getAzurePrice(filter) {
    const apiVersion = '2023-01-01-preview'; 
    // Ajout de la version API, de la devise et encodage du filtre pour l'URL
    const url = `https://prices.azure.com/api/retail/prices?api-version=${apiVersion}&currencyCode=USD&$filter=${encodeURIComponent(filter)}`;
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            // Gérer les erreurs HTTP de l'API Azure
            console.error(`Erreur HTTP de l'API Azure: ${response.status} ${response.statusText}`);
            return 0;
        }

        const data = await response.json();
            
        // Retourne le prix unitaire du premier résultat (retailPrice)
        if (data.Items && data.Items.length > 0) {
            return data.Items[0].retailPrice;
        }

    } catch (error) {
        console.error("Erreur lors de l'appel à l'API de prix Azure:", error);
    }
    return 0;
}

module.exports = async function (context, req) {
    // 1. RECEVOIR LES PARAMÈTRES DU CLIENT (via le formulaire YOOF)
    const numberOfUsers = parseInt(req.body.numberOfUsers) || 10;
    const tier = req.body.tier || 'Standard';
    // Utiliser le nom Azure pour la région dans les filtres
    const regionName = 'westeurope'; 
    const regionARM = 'West Europe'; // armRegionName utilise le nom complet pour les filtres

    // 2. DÉFINIR LES CONSTANTES YOOF
    const MARGE_YOOF = 1.30;
    const AUTO_SCALE_FACTOR = 0.60;
    const PROFILE_SIZE_GB = 15;
    // Hypothèse de dimensionnement : 4 utilisateurs par VM Standard_D4s_v5
    const USERS_PER_VM = 4;
    const VMS_REQUIRED = Math.ceil(numberOfUsers / USERS_PER_VM);

    try {
        // --- 3. COÛT COMPUTE (VMs AVD) ---
        // Utiliser armRegionName au lieu de armRegionName (avec espace dans le nom) et s'assurer que '3 Years' est correct.
        const filterCompute = `serviceName eq 'Virtual Machines' and armRegionName eq '${regionARM}' and armSkuName eq 'Standard_D4s_v5' and priceType eq 'Reservation' and reservationTerm eq '3 Years'`;
        
        // Le prix retourné par l'API de Réservation (RI) est déjà le prix mensuel
        const priceVM_RI_Monthly = await getAzurePrice(filterCompute); 

        // Si l'API ne retourne pas le prix (priceVM_RI_Monthly = 0), un prix par défaut peut être utile
        if (priceVM_RI_Monthly === 0) {
            context.log('Avertissement: Prix RI VM non trouvé. Utilisation de 120.00 USD par défaut.');
        }
        
        const costVMBase = priceVM_RI_Monthly > 0 ? priceVM_RI_Monthly : 120.00;
        const costComputeTotal = costVMBase * VMS_REQUIRED * AUTO_SCALE_FACTOR;

        // --- 4. COÛT STOCKAGE (FSLogix) ---
        // Vérifiez le nom exact du produit dans la documentation de l'API pour une correspondance exacte.
        // Utiliser le nom complet de la région dans armRegionName
        const totalStorageGB = numberOfUsers * PROFILE_SIZE_GB;
        const filterStorage = `serviceName eq 'Storage' and armRegionName eq '${regionARM}' and productName eq 'Azure Files Premium LRS' and unitOfMeasure eq 'GB'`;
        const priceStoragePerGB = await getAzurePrice(filterStorage);
            
        const costStorageTotal = totalStorageGB * priceStoragePerGB;
            
        // --- 5. COÛT SÉCURITÉ ET RÉSEAU (Coûts fixes) ---
        // Garder les estimations fixes car l'API pour ces services est plus complexe à filtrer.
        const costPrivateLink = 2 * 9.30; // USD
        const costDefender = VMS_REQUIRED * 15.00; // USD par VM

        // --- 6. CALCUL FINAL ---
        const totalAzureCostBrut = costComputeTotal + costStorageTotal + costPrivateLink + costDefender;
            
        const totalYoofPrice = totalAzureCostBrut * MARGE_YOOF;

        const pricePerUserPerMonth = totalYoofPrice / numberOfUsers;

        // 7. ENVOI DE LA RÉPONSE AU SITE WEB
        context.res = {
            body: {
                price: parseFloat(pricePerUserPerMonth.toFixed(2)),
                currency: "USD",
                per: "utilisateur/mois",
                details: {
                    users: numberOfUsers,
                    vms: VMS_REQUIRED,
                    costBrut: parseFloat(totalAzureCostBrut.toFixed(2)),
                    // Inclure les coûts pour la transparence
                    computeCost: parseFloat(costComputeTotal.toFixed(2)),
                    storageCost: parseFloat(costStorageTotal.toFixed(2))
                }
            }
        };

    } catch (error) {
        context.log.error('Erreur de calcul YOOF:', error);
        context.res = {
            status: 500,
            body: { message: "Erreur interne lors du calcul du prix. Veuillez réessayer." }
        };
    }
};
