🏆 API Yoof-Pricing : Résumé du Projet et Stabilisation CI/CD
Ce document présente l'API Yoof-Pricing, une fonction Azure Serverless conçue pour calculer les coûts d'abonnement en temps réel, et récapitule les étapes critiques pour stabiliser son pipeline de déploiement continu.

🚀 I. Statut Actuel et URL de l'API
L'API est entièrement validée, le code est sécurisé, et le pipeline CI/CD est stable.

Composant	Statut	Détails
Code	✅ Validé localement	La logique de calcul (gestion des utilisateurs et des niveaux) est testée et fonctionne sans erreur.
Déploiement	✅ Pipeline stable	Le workflow GitHub Actions se termine avec un statut SUCCESS grâce à la structure de dépôt corrigée.
Endpoint	🌐 Prêt pour l'intégration	https://yoof-price-estimator.azurewebsites.net/api/HttpTrigger

Exporter vers Sheets

Format de la Requête (POST)
JSON

{
    "numberOfUsers": 20,
    "tier": "Standard"
}
🛠️ II. Résolution des Défis Techniques Majeurs
La phase la plus complexe a été la correction de l'architecture du dépôt, qui a nécessité une intervention manuelle sur Git et le pipeline.

1. 📂 Réorganisation du Dépôt
Un problème de structure de dossier redondante (yoof-pricing-api-main/yoof-pricing-api-main) a bloqué le déploiement.

Problème : Le pipeline ne pouvait pas localiser les fichiers sources, provoquant l'erreur package : cannot find 'yoof-pricing-api-main' lors de l'étape deploy.

Correction : Déplacement forcé de tous les fichiers du sous-dossier vers la racine du dépôt. Cette action a été sécurisée par des commandes PowerShell spécifiques et un push Git résolvant les conflits.

2. 🔗 Stabilisation du CI/CD (GitHub Actions)
L'action de déploiement a été mise à jour pour refléter la nouvelle structure du projet.

Correction YML : Le fichier .github/workflows/main_yoof-price-estimator.yml a été mis à jour pour définir le chemin de construction et de package à la racine (.).

YAML

env:
  BUILD_PATH: '.' 
  DEPLOY_PACKAGE_NAME: '.'
3. 🛡️ Validation du Test Local
L'environnement de développement Windows a présenté des problèmes de réseau (erreur getaddrinfo ENOTFOUND yoof-price-estimator.azurewebsites.net lors du test de l'URL de production ) et des problèmes d'outils (func start).

Solution : Les outils Azure Core Tools ont été réinstallés, et le test a été effectué en pointant vers l'instance locale (http://localhost:7071).

Conclusion : Le test local a été un succès , confirmant la validité du code avant l'intégration.

🤝 III. Pour l'Intégration Front-end
L'API est prête à être consommée. Il est recommandé que l'appel HTTP soit effectué depuis le Back-end du site Yoof pour une meilleure sécurité et gestion des clés futures, plutôt que directement depuis le JavaScript du front-end.
