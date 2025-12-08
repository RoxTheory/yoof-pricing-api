const fetch = require('node-fetch');

// Fonction pour appeler l'API de prix Azure avec un filtre spécifique
async function getAzurePrice(filter) {
    const apiVersion = '2023-01-01-preview'; 
    const url = `https://prices.azure.com/api/retail/prices?api-version=${apiVersion}&currencyCode=USD&$filter=${encodeURIComponent(filter)}`;
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            console.error(`Erreur HTTP de l'API Azure: ${response.status} ${response.statusText}. URL: ${url}`);
            return 0;
        }

        const data = await response.json();
            
        if (data.Items && data.Items.length > 0) {
            return data.Items[0].retailPrice;
        }

    } catch (error) {
        console.error("Erreur lors de l'appel à l'API de prix Azure:", error);
    }
    return 0;
}

module.exports = async function (context, req) {
    // 1. RECEVOIR LES PARAMÈTRES DU CLIENT
    const numberOfUsers = parseInt(req.body.numberOfUsers) || 10;
    const tier = req.body.tier || 'Standard';
    const regionARM = 'West Europe'; 

    // 2. DÉFINIR LES CONSTANTES YOOF
    const MARGE_YOOF = 1.30;
    const AUTO_SCALE_FACTOR = 0.60;
    const PROFILE_SIZE_GB = 15;
    const HOURS_IN_MONTH = 730; 
    
    // PRIX DE SECOURS (FALLBACK)
    // Si l'API échoue pour le stockage, on utilise ce prix standard pour Azure Files Premium
    const FALLBACK_STORAGE_PRICE_PER_GB = 0.16; 
    
    const USERS_PER_VM = 4;
    const VMS_REQUIRED = Math.ceil(numberOfUsers / USERS_PER_VM);

    try {
        // --- 3. COÛT COMPUTE (VMs AVD) ---
        // Ce filtre fonctionne (validé précédemment)
        const filterComputeTest = `serviceName eq 'Virtual Machines' and priceType eq 'Consumption'`;
        
        const priceVM_Consumption_Hourly = await getAzurePrice(filterComputeTest); 

        if (priceVM_Consumption_Hourly === 0) {
            context.log('Avertissement: Prix VM (Consumption) non trouvé. Utilisation de 120.00 USD par défaut.');
        }
        
        const costVMBase = priceVM_Consumption_Hourly > 0 ? (priceVM_Consumption_Hourly * HOURS_IN_MONTH) : 120.00;
        const costComputeTotal = costVMBase * VMS_REQUIRED * AUTO_SCALE_FACTOR;

        // --- 4. COÛT STOCKAGE ---
        const totalStorageGB = numberOfUsers * PROFILE_SIZE_GB;
        
        // Tentative API : On cherche très large 'Storage' dans la région
        const filterStorage = `serviceFamily eq 'Storage' and armRegionName eq '${regionARM}'`;
        let priceStoragePerGB = await getAzurePrice(filterStorage);
        
        // LOGIQUE DE SÉCURITÉ :
        // Si l'API renvoie 0 (échec) OU un prix aberrant (> 1$ par Go signifie qu'on a trouvé un disque entier et pas un GB),
        // on utilise le prix de secours.
        if (priceStoragePerGB === 0 || priceStoragePerGB > 1.0) {
            context.log(`Info: Utilisation du prix de stockage par défaut (${FALLBACK_STORAGE_PRICE_PER_GB}$) car l'API a retourné: ${priceStoragePerGB}`);
            priceStoragePerGB = FALLBACK_STORAGE_PRICE_PER_GB;
        } else {
            context.log(`Succès: Prix Stockage API trouvé: ${priceStoragePerGB}`);
        }
        
        const costStorageTotal = totalStorageGB * priceStoragePerGB;

        // --- 5. COÛT SÉCURITÉ ET RÉSEAU (Coûts fixes) ---
        const costPrivateLink = 2 * 9.30; 
        const costDefender = VMS_REQUIRED * 15.00; 

        // --- 6. CALCUL FINAL ---
        const totalAzureCostBrut = costComputeTotal + costStorageTotal + costPrivateLink + costDefender;
            
        const totalYoofPrice = totalAzureCostBrut * MARGE_YOOF;

        const pricePerUserPerMonth = totalYoofPrice / numberOfUsers;

        // 7. ENVOI DE LA RÉPONSE
        context.res = {
            body: {
                price: parseFloat(pricePerUserPerMonth.toFixed(2)),
                currency: "USD",
                per: "utilisateur/mois",
                details: {
                    users: numberOfUsers,
                    vms: VMS_REQUIRED,
                    costBrut: parseFloat(totalAzureCostBrut.toFixed(2)),
                    computeCost: parseFloat(costComputeTotal.toFixed(2)),
                    storageCost: parseFloat(costStorageTotal.toFixed(2)),
                    // Pour vérifier quel prix a été utilisé
                    storageUnitUsed: priceStoragePerGB 
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