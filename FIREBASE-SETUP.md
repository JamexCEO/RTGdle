# Account progress and friends

1. In the RTGdle Firebase console, open Databases & Storage, then Firestore Database.
2. Create the default database using Standard edition and production mode. Select a suitable region, such as Melbourne if available. The region is chosen when the database is created.
3. Open the database's Rules tab. Replace its contents with the complete contents of firestore.rules and click Publish.
4. Upload the updated index.html, app.js, account.js and style.css to the GitHub repository. Keep the configured firebase-config.js.
5. Test Google sign-in on the deployed website. In Account, choose a unique username. In Friends, enter another user's username and accept the request from that account.

Guest results are temporary. Previous browser-local results are excluded from account history. Signed-in draws and rides are stored in private account subcollections. Usernames are visible to signed-in users by exact lookup. Friendship records are visible to their two participants. The Friends page supports requests, acceptance, cancellation, declining and removal.

The draw document uses a Melbourne calendar-day identifier. Firestore rules validate the day against server time, using Victoria's current first-Sunday-in-April/October daylight-saving rules. Draw records cannot be overwritten or deleted by clients. Username ownership and the single rename are validated atomically in the database rules.

Route validity, random selection and XP are calculated by the client. The database enforces the daily creation limit, access controls and profile changes. Competitive cheat-resistant random results would require server-side generation.

After publishing, test from two browsers signed in to the same account. Both should display the same daily result. Also test simultaneous draws, signing out, and one username change. The second username change must be denied. These cloud checks require the live Firebase project and published rules.
