# Vérification des cours non-émargés
Il nous est tous arrivé d'oublier d'émarger... Mais savez-vous combien de cours, et surtout, lesquels ?
Comme pour l'[émargement](README.md), j'utilise [Google Apps script](https://developers.google.com/apps-script). 

Le code se trouve [ici](verif.gs).

## 📋 Guide d'utilisation

### 1. Compléter les variables :

Il vous faut remplir les variables définies dès le début du code :
- `FORMATION` soit cyberdefense, cyberlog ou cyberdata
- `A` votre année d'études, donc 3, 4 ou 5
- `TP` votre TP, donc 1, 2, 3, 4, 5 ou 6
- `username` votre username pour la connexion à moodle (format *exxxxxxx*)
- `password` votre password pour la connexion à moodle
- `ignoredCourses` Ajoutez d'autres cours si jamais j'en ai oublié (il faut mettre **exactement** le nom présent dans l'emploie du temps)
- `notif` Si vous voulez recevoir une notification tous les vendredi à 20h des cours non-émargés (fonctionne en semaine de cours uniquement)
- `pltNotif` Choisissez la plate-forme utilisée pour vos notifications (Ntfy ou DIscord)
- `topic` Lien pour les notifs. Pour Ntfy, renseignez simplement le topic, pour Discord mettez l'URL complet (fonctionne avec la fonction _scheduleRecap_)

La mise en place de notifications est identique à celle du script pour l'[émargement](README.md)

### 2. Exécuter la fonction _scheduleRecap_ ou _globale_ et autoriser les accès à votre script :

Il ne vous manque plus qu'à **Exécuter** la fonction _scheduleRecap_ ou _globale_ (la première et deuxième qui apparaîssent après avoir copié-collé le code dans Apps script puis enregistré) et de laisser les choses faire ! Cela depend simplement de votre besoin :
- Si vous souhaitez simplement voir les cours non-émargés depuis le 8 septembre, utilisez plutôt _globale_
- Si vous souhaitez recevoir un rapport en notification toutes les semaines pour être sûr de ne pas oublier d'émargement, exécuter _scheduleRecap_ 

Tout comme pour le code sur l'émargement, si c'est un nouveau fichier et qu'il n'a pas encore d'autorisation, c'est normal si Google vous demande de nouveau des accès (accès à Internet + autorisation de d'auto-planification).

Il ne vous reste plus qu'à attendre la fin de l'exécution du code et de voir (ou de recevoir sur votre téléphone si vous utilisez ntfy.sh) si vous avez oublié des émargements ou non !

<img width="873" height="305" alt="image" src="https://github.com/user-attachments/assets/79aca653-7bc7-4692-929b-302d2b14b275" />
