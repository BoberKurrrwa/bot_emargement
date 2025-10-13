# bot_emargement
Bienvenue sur mon bot qui vous permettra de recevoir des notifications (voire émarger) pour l'ENSIBS (valable pour les 3, 4 et 5A de cyberdéfense, cyberdata et cyberlog) via [Google Apps script](https://developers.google.com/apps-script).

Le point fort de ce projet ? Aucunement besoin de louer un serveur pour héberger un script, vous avez simplement besoin d'aovir un compte Google !

> [!CAUTION]
> Il est strictement interdit d'émarger alors que vous n'êtes pas présent en cours, pensez à annuler l'émargement auto en passant la variable _emarger_ à *false* si vous n'êtes pas présent que vous laissez le bot en émargement auto.

## 📋 Guide d'utilisation

### 1. Installer ntfy.sh :

[ntfy.sh](https://ntfy.sh/) va vous permettre de recevoir des messages en fonction des channels auxquels vous décidez de vous abonner. Si vous souhaiter avoir un channel uniquement pour vous, le nom du topic que vous allez utiliser servira de clé donc pensez à en utiliser un long et complexe pour ne pas tomber sur le même qu'un autre utilisateur.

### 2. Compléter les variables :

En fonction de vos besoins, il vous faut remplir les variables définies dès le début du code (si vous l'utilisez uniquement en notification, pas besoin d'entrer vos credentials...).

Premièrement, le mode du bot :
- `emarger` Si true -> mode émargement | si false -> mode notification

Ensuite, les informations vous concernants :
- `FORMATION` soit cyberdefense, cyberlog ou cyberdata
- `A` votre année d'études, donc 3, 4 ou 5
- `TP` votre TP, donc 1, 2, 3, 4, 5 ou 6
- `username` votre username pour la connexion à moodle
- `password` votre password pour la connexion à moodle
- `ignoredCourses` Ajoutez les cours ou vous ne souhaitez pas émarger ni recevoir les notis
- `topic` utilisé pour envoyer les notifs relatives au cours

Enfin, les variables concernant les notificaitons :
- `ntftemps` Si true -> notif pour savoir le temps avant que l'on émarge automatiquement
- `ntfcours` Si true -> notif pour rappeler d'émarger au cours
- `ntfemarger` Si true -> notif pour dire que le bot à émarger (si t'émarges avec le bot et que tu mets ça à false t'es un malade mental sache le)
- `ntfweek` Si true -> notif début de semaine pour résumé de la semaine 
- `ntfjour` Si true -> notif à 7h30 pour résumé de la journée

### 3. Exécuter la fonction _scheduleDailyNotifications_ et autoriser les accès à votre script :

Il ne vous manque plus qu'à exécuter la fonction _scheduleDailyNotifications_ et de laisser les choses faire ! Pour cela, sélectionner la fonction _scheduleDailyNotifications_ dans le menu déroulant : 

<img width="1160" height="532" alt="image" src="https://github.com/user-attachments/assets/d2de86fc-d0e3-42fa-8c1c-ee7d2734b0b7" />


Et cliquez sur "Exécuter".

Pas de panique si à la première exécution Google vous demande de laisser de lui donner certaines autorisations, elles sont nécessaires afin que votre programme soit capable de s'exécuter en autonomie et qu'il puisse aller chercher des informations sur internet.


(Merci à 🔥[MTlyx](https://github.com/MTlyx)🔥 pour l'API)

