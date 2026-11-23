/* Barbos Analytic · coffre des paris VIP en attente
   bets.json est public : un pari VIP sans résultat n'y est jamais écrit en clair. Les admins
   (/bankroll/admin/ et /sv/bankroll/admin/) le chiffrent dans le champ "vipVault" :
   AES-GCM 256 bits, clé dérivée du mot de passe VIP par PBKDF2-SHA256.
   Dès qu'un pari VIP a un résultat, il sort du coffre et passe dans "bets" comme les autres. */
(function () {
  'use strict';

  var ITER = 600000, PAD = 1024;
  var enc = new TextEncoder(), dec = new TextDecoder();
  var keys = {};

  function toB64(bytes) {
    var s = '';
    bytes = new Uint8Array(bytes);
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function fromB64(b64) { return Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); }); }
  function random(n) { return crypto.getRandomValues(new Uint8Array(n)); }

  // La dérivation est volontairement lente : on la garde en mémoire pour la session.
  function key(pass, salt, iter) {
    var id = iter + ':' + salt + ':' + pass;
    if (!keys[id]) {
      keys[id] = crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']).then(function (base) {
        return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromB64(salt), iterations: iter, hash: 'SHA-256' },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
      keys[id].catch(function () { delete keys[id]; });
    }
    return keys[id];
  }

  // prev : coffre actuel. On garde son sel, donc le même mot de passe reste valable.
  function seal(bets, pass, prev) {
    var salt = prev ? prev.salt : toB64(random(16)), iter = prev && prev.iter ? prev.iter : ITER, iv = random(12);
    // Taille arrondie au Ko : la longueur du coffre ne trahit pas le nombre de paris.
    var raw = enc.encode(JSON.stringify(bets)), padded = new Uint8Array(Math.ceil((raw.length + 1) / PAD) * PAD).fill(32);
    padded.set(raw);
    return key(pass, salt, iter).then(function (k) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, padded);
    }).then(function (data) {
      return { v: 1, iter: iter, salt: salt, iv: toB64(iv), data: toB64(data) };
    });
  }

  // Rejette la promesse si le mot de passe est faux : AES-GCM vérifie l'intégrité.
  function open(vault, pass) {
    return key(pass, vault.salt, vault.iter || ITER).then(function (k) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(vault.iv) }, k, fromB64(vault.data));
    }).then(function (buf) {
      var bets = JSON.parse(dec.decode(buf));
      return Array.isArray(bets) ? bets : [];
    });
  }

  window.BankrollVault = { seal: seal, open: open };
})();
