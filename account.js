(async () => {
  const el = id => document.getElementById(id);
  const status = el('account-status');
  const emit = (store, loading, trips = []) => window.dispatchEvent(
    new CustomEvent('account-change', { detail: { store, loading, trips } })
  );
  if (!firebaseConfig || !['http:', 'https:'].includes(location.protocol)) {
    status.textContent = 'Google sign-in requires the configured website.';
    emit(null, false);
    return;
  }
  try {
    const cdn = 'https://www.gstatic.com/firebasejs/13.3.0/';
    const [{ initializeApp }, authSdk, dbSdk] = await Promise.all([
      import(cdn + 'firebase-app.js'), import(cdn + 'firebase-auth.js'),
      import(cdn + 'firebase-firestore.js')
    ]);
    const app = initializeApp(firebaseConfig);
    const auth = authSdk.getAuth(app);
    const db = dbSdk.getFirestore(app);
    const { doc, collection, query, where, onSnapshot, runTransaction, serverTimestamp,
      setDoc, getDoc, updateDoc, deleteDoc } = dbSdk;
    let store = null;
    let profile = null;
    let unsubscribe = [];
    let session = 0;

    const failure = error => error.code === 'permission-denied'
      ? 'Access denied. Check the published Firestore rules and your account permissions.'
      : error.message || 'Could not connect. Try again.';

    authSdk.onAuthStateChanged(auth, user => {
      const currentSession = ++session;
      unsubscribe.forEach(stop => stop());
      unsubscribe = [];
      store = null;
      profile = null;
      el('friends-list').replaceChildren();
      el('friends-status').textContent = 'Sign in and choose a username to add friends.';
      el('username-form').hidden = !user;
      el('profile-status').textContent = '';
      el('account-link').textContent = user ? 'Account' : 'Sign in';
      el('google-sign-in').hidden = Boolean(user);
      el('sign-out').hidden = !user;
      status.textContent = user ? 'Loading account progress…' : 'Guest mode. Draws disappear when you leave and earn no saved XP.';
      emit(null, Boolean(user));
      if (!user) return;

      const userPath = ['users', user.uid];
      const candidateStore = {
        async roll() {
          const trip = { ...RailGame.draw(RailGame.dayKey()), networkVersion: 1 };
          const day = Math.floor(Date.parse(trip.date) / 86400000);
          const ref = doc(db, ...userPath, 'draws', String(day));
          const result = await runTransaction(db, async transaction => {
            const existing = await transaction.get(ref);
            if (existing.exists()) return existing.data().trip;
            transaction.set(ref, { trip, createdAt: serverTimestamp() });
            return trip;
          });
          return result;
        },
        async saveRide(trip) {
          await setDoc(doc(collection(db, ...userPath, 'rides')), {
            trip: { ...trip, networkVersion: 1 }, createdAt: serverTimestamp()
          });
        }
      };
      const buckets = { draws: null, rides: null };
      function publish() {
        if (currentSession !== session || !buckets.draws || !buckets.rides) return;
        store = candidateStore;
        const trips = [...buckets.draws, ...buckets.rides].sort((a, b) => b.date.localeCompare(a.date));
        status.textContent = 'Signed in. Progress is saved to your account.';
        // Snapshot updates preserve a reveal's account identity.
        window.dispatchEvent(new CustomEvent('account-progress', { detail: { store, trips } }));
      }
      for (const name of ['draws', 'rides']) {
        unsubscribe.push(onSnapshot(collection(db, ...userPath, name), snapshot => {
          buckets[name] = snapshot.docs.map(item => item.data().trip).filter(trip => trip && RailGame.score(trip).length);
          publish();
        }, error => {
          if (currentSession !== session) return;
          store = null;
          emit(null, true);
          status.textContent = failure(error);
        }));
      }
      unsubscribe.push(onSnapshot(doc(db, 'profiles', user.uid), snapshot => {
        if (currentSession !== session) return;
        profile = snapshot.exists() ? snapshot.data() : null;
        el('username').value = profile?.username ?? '';
        const locked = profile?.changes === 1;
        el('username-form').hidden = locked;
        el('profile-status').textContent = profile
          ? '@' + profile.username + (locked ? ' · Username change used.' : ' · One username change available.')
          : 'Choose your username to use Friends.';
      }, error => { el('profile-status').textContent = failure(error); }));

      unsubscribe.push(onSnapshot(query(collection(db, 'friendships'), where('members', 'array-contains', user.uid)), async snapshot => {
        const rows = await Promise.all(snapshot.docs.map(async item => {
          const friendship = item.data();
          const other = friendship.members.find(uid => uid !== user.uid);
          const otherProfile = await getDoc(doc(db, 'profiles', other));
          return { id: item.id, ...friendship, name: otherProfile.data()?.username ?? 'Unknown user' };
        })).catch(() => null);
        if (currentSession !== session || !rows) return;
        el('friends-list').replaceChildren();
        el('friends-status').textContent = rows.length ? 'Your friends and requests' : 'No friends yet. Send a request by username.';
        for (const row of rows) {
          const container = document.createElement('div');
          container.className = 'friend-row';
          const label = document.createElement('span');
          const incoming = row.status === 'pending' && row.sender !== user.uid;
          label.textContent = '@' + row.name + ' · ' +
            (row.status === 'accepted' ? 'Friends' : incoming ? 'Incoming request' : 'Request sent');
          container.append(label);
          const action = (text, callback) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'outline';
            button.textContent = text;
            button.addEventListener('click', async () => {
              button.disabled = true;
              try { await callback(); }
              catch (error) { el('friends-status').textContent = failure(error); button.disabled = false; }
            });
            container.append(button);
          };
          if (incoming) action('Accept', () => updateDoc(doc(db, 'friendships', row.id), { status: 'accepted' }));
          action(row.status === 'accepted' ? 'Remove' : incoming ? 'Decline' : 'Cancel', () => deleteDoc(doc(db, 'friendships', row.id)));
          el('friends-list').append(container);
        }
      }, error => { el('friends-status').textContent = failure(error); }));
    });

    el('username-form').addEventListener('submit', async event => {
      event.preventDefault();
      const user = auth.currentUser;
      if (!user || !store) return;
      const name = el('username').value.trim().toLowerCase();
      if (!/^[a-z0-9_]{3,20}$/.test(name)) return;
      const button = event.target.querySelector('button');
      button.disabled = true;
      try {
        await runTransaction(db, async transaction => {
          const profileRef = doc(db, 'profiles', user.uid);
          const nameRef = doc(db, 'usernames', name);
          const [existingProfile, claimedName] = await Promise.all([
            transaction.get(profileRef), transaction.get(nameRef)
          ]);
          const previous = existingProfile.data();
          if (previous?.username === name) return;
          if (previous?.changes === 1) throw Error('Your username change has already been used.');
          if (claimedName.exists()) throw Error('That username is taken.');
          transaction.set(nameRef, { uid: user.uid });
          transaction.set(profileRef, { username: name, changes: previous ? 1 : 0 });
          if (previous) transaction.delete(doc(db, 'usernames', previous.username));
        });
      } catch (error) { el('profile-status').textContent = failure(error); }
      finally { button.disabled = false; }
    });
    el('friend-form').addEventListener('submit', async event => {
      event.preventDefault();
      const user = auth.currentUser;
      if (!user || !profile || !store) {
        el('friends-status').textContent = 'Sign in and choose a username first.';
        return;
      }
      try {
        const name = el('friend-name').value.trim().toLowerCase();
        const target = await getDoc(doc(db, 'usernames', name));
        if (!target.exists()) throw Error('Username not found.');
        const other = target.data().uid;
        if (other === user.uid) throw Error('Enter a friend’s username.');
        const members = [user.uid, other].sort();
        const ref = doc(db, 'friendships', members.join('_'));
        await runTransaction(db, async transaction => {
          if ((await transaction.get(ref)).exists()) throw Error('A friendship or request already exists.');
          transaction.set(ref, { members, sender: user.uid, status: 'pending' });
        });
        el('friends-status').textContent = 'Request sent.';
      } catch (error) { el('friends-status').textContent = failure(error); }
    });
    el('google-sign-in').addEventListener('click', async () => {
      el('google-sign-in').disabled = true;
      try { await authSdk.signInWithPopup(auth, new authSdk.GoogleAuthProvider()); }
      catch { status.textContent = 'Google sign-in could not finish. Allow pop-ups and check your connection.'; }
      finally { el('google-sign-in').disabled = false; }
    });
    el('sign-out').addEventListener('click', async () => {
      try { await authSdk.signOut(auth); }
      catch { status.textContent = 'Could not sign out. Try again.'; }
    });
  } catch {
    status.textContent = 'Account services could not load. Check your Firebase configuration and connection.';
    emit(null, false);
  }
})();
