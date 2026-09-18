// Worker BullMQ — traite les tâches de fond (aujourd'hui : rien de bloquant nécessite un worker séparé
// pour le MVP, le traitement se fait en synchrone dans la route /avis). Prévu pour absorber le traitement
// asynchrone d'un gros volume de dossiers sans bloquer l'API, comme demandé par la stack recommandée
// (BullMQ) — squelette prêt à brancher une queue "traitement-avis" si le temps le permet.
console.log("Worker TenderPilot démarré (aucune queue active pour le MVP).");
setInterval(() => {}, 1 << 30);
