# bot_emargement
Bienvenue sur mon bot qui vous permettra de recevoir des notifications (voire émarger) pour l'ENSIBS (valable pour les 3, 4 et 5A de cyberdéfense, cyberdata et cyberlog) via [Google Apps script](https://developers.google.com/apps-script).

## ⚠️ Remarques Importantes :

Il est strictement interdit d'émarger alors que vous n'êtes pas présent en cours, pensez à annuler l'émargement auto en passant la variable _emarger_ à *false*.

## 📋 Guide d'utilisation

### 1. Installer ntfy.sh :

[ntfy.sh](https://ntfy.sh/) va vous permettre de recevoir des messages en fonction des channels auxquels vous décidez de vous abonner. Si vous souhaiter avoir un channel uniquement pour vous, le nom du topic que vous allez utiliser servira de clé donc pensez à en utiliser un long et complexe pour ne pas tomber sur le même qu'un autre utilisateur.

Vous pouvez utiliser 2 canaux différents ici (ou 1 seul, selon votre volonté).

### 2. Compléter les variables :

En fonction de vos besoins, il vous faut remplir les variables définies dès le début du code (si vous l'utilisez uniquement en notification, pas besoin d'entrer vos credentials...).

### 3. Autoriser les accès pouv votre script :

Google va vous demander de laisser les autorisations nécessaires afin que votre programme soit capable de s'exécuter en autonomie et qu'il puisse aller chercher des informations sur internet.

### 4. Exécuter la fonction _scheduleDailyNotifications_ :

Il ne vous manque plus qu'à exécuter la fonction _scheduleDailyNotifications_ et de laisser les choses faire !

