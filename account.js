(async () => {
  const status = document.getElementById('account-status');
  const link = document.getElementById('account-link');
  const signInButton = document.getElementById('google-sign-in');
  const signOutButton = document.getElementById('sign-out');

  if (!firebaseConfig) {
    status.textContent = 'Google sign-in is awaiting site setup.';
    return;
  }
  if (!['http:', 'https:'].includes(location.protocol)) {
    status.textContent = 'Open RTGdle on its website to sign in with Google.';
    return;
  }

  try {
    const cdn = 'https://www.gstatic.com/firebasejs/13.3.0/';
    const [{ initializeApp }, authSdk] = await Promise.all([
      import(cdn + 'firebase-app.js'),
      import(cdn + 'firebase-auth.js')
    ]);
    const { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } = authSdk;
    const auth = getAuth(initializeApp(firebaseConfig));
    const messages = new Map([
      ['auth/popup-closed-by-user', 'Sign-in window closed. You can try again.'],
      ['auth/popup-blocked', 'Allow pop-ups for this site and try again.'],
      ['auth/unauthorized-domain', 'This site’s domain needs to be authorised in Firebase.'],
      ['auth/operation-not-allowed', 'Google sign-in needs to be enabled in Firebase.'],
      ['auth/network-request-failed', 'Could not reach Google sign-in. Check your connection and try again.']
    ]);

    onAuthStateChanged(auth, user => {
      link.textContent = user ? 'Account' : 'Sign in';
      signInButton.hidden = Boolean(user);
      signOutButton.hidden = !user;
      status.textContent = user
        ? 'Signed in as ' + (user.displayName || 'a Google user') + '.'
        : 'You’re playing as a guest.';
    });

    signInButton.addEventListener('click', async () => {
      signInButton.disabled = true;
      status.textContent = 'Continue in the Google sign-in window.';
      try {
        await signInWithPopup(auth, new GoogleAuthProvider());
      } catch (error) {
        status.textContent = messages.get(error.code) ?? 'Google sign-in could not finish. Try again.';
      } finally {
        signInButton.disabled = false;
      }
    });

    signOutButton.addEventListener('click', async () => {
      signOutButton.disabled = true;
      try {
        await signOut(auth);
      } catch {
        status.textContent = 'Could not sign out. Try again.';
      } finally {
        signOutButton.disabled = false;
      }
    });
  } catch {
    status.textContent = 'Google sign-in could not load. Check your connection or the site’s Firebase configuration.';
  }
})();
