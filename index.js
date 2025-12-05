const fetch = require('node-fetch');

// Fonction pour appeler l'API de prix Azure avec un filtre spécifique
async function getAzurePrice(filter) {
    const url = `https://prices.azure.com/api/retail/prices?$filter=${filter}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        // Retourne le prix unitaire du premier résultat
        if (data.Items && data.Items.length > 0) {
            return data.Items[0].retailPrice;
        }
    } catch (error) {
        console.error("Erreur lors de l'appel à l'API de prix Azure:", error);
    }
    return 0; // Retourne 0 en cas d'échec
}

module.exports = async function (context, req) {
    // 1. RECEVOIR LES PARAMÈTRES DU CLIENT (via le formulaire YOOF)
    const numberOfUsers = parseInt(req.body.numberOfUsers) || 10; // 10 par défaut si non spécifié
    const tier = req.body.tier || 'Standard';
    const region = 'westeurope'; // Région où se trouve votre Host Pool

    // 2. DÉFINIR LES CONSTANTES YOOF
    const MARGE_YOOF = 1.30; // Marge de 30% sur le coût brut
    const AUTO_SCALE_FACTOR = 0.60; // Assurez une utilisation de 60% avec l'Auto-scaling 
    const PROFILE_SIZE_GB = 15; // Taille de profil FSLogix par utilisateur

    // Hypothèse de dimensionnement : 4 utilisateurs par VM Standard_D4s_v5
    const VMS_REQUIRED = Math.ceil(numberOfUsers / 4);

    try {
        // 3. COÛT COMPUTE (VMs AVD) - Le plus complexe (RI 3 ans + Auto-scaling)
        const filterCompute = `serviceName eq 'Virtual Machines' and armRegionName eq '${region}' and armSkuName eq 'Standard_D4s_v5' and priceType eq 'Reservation' and reservationTerm eq '3 Years'`;
        const priceVM_RI_Monthly = await getAzurePrice(filterCompute);

        const costComputeTotal = priceVM_RI_Monthly * VMS_REQUIRED * AUTO_SCALE_FACTOR;

        // 4. COÛT STOCKAGE (FSLogix)
        const totalStorageGB = numberOfUsers * PROFILE_SIZE_GB;
        const filterStorage = `serviceName eq 'Storage' and armRegionName eq '${region}' and productName eq 'Azure Files Premium LRS' and unitOfMeasure eq 'GB'`;
        const priceStoragePerGB = await getAzurePrice(filterStorage);
        
        const costStorageTotal = totalStorageGB * priceStoragePerGB;
        
        // 5. COÛT SÉCURITÉ ET RÉSEAU (Coûts fixes)
        // Coût des Private Endpoints (minimum 2 : Storage + AVD) - Environ 9,30 $ US par mois chacun
        const costPrivateLink = 2 * 9.30; 
        
        // Coût Microsoft Defender for Servers P2 (sur chaque VM Host) - Prix fixe par VM/mois
        // Prix Defender (exemple de filtre : serviceName eq 'Security' and productName eq 'Microsoft Defender for Servers P2')
        // NOTE: Pour le lab, on pourrait utiliser une estimation de 15 $ US/VM/mois si l'API est trop complexe à filtrer.
        const costDefender = VMS_REQUIRED * 15.00; 

        // 6. CALCUL FINAL
        const totalAzureCostBrut = costComputeTotal + costStorageTotal + costPrivateLink + costDefender;
        
        const totalYoofPrice = totalAzureCostBrut * MARGE_YOOF;

        const pricePerUserPerMonth = totalYoofPrice / numberOfUsers;

        // 7. ENVOI DE LA RÉPONSE AU SITE WEB
        context.res = {
            body: {
                price: parseFloat(pricePerUserPerMonth.toFixed(2)),
                currency: "$ US",
                per: "utilisateur/mois",
                details: {
                    users: numberOfUsers,
                    vms: VMS_REQUIRED,
                    costBrut: parseFloat(totalAzureCostBrut.toFixed(2))
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
