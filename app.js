const byId = id => document.getElementById(id);
const { badges, lines, models, getLine, getDestinations, dayKey, score, draw } = RailGame;
let accountStore = null;
let accountLoading = true;
let guestRoll = null;
let accountGeneration = 0;
let accountTrips = [];
const dateLabel = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long'
});
let lastRide;
let renderedDay;
let drawing = false;
const stationNames = [...new Set(lines.flatMap(line => line.stops))];
const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Mythic', 'Anomaly'];
const catalogue = Object.keys(badges).sort((a, b) =>
  rarityOrder.indexOf(badges[a].tier) - rarityOrder.indexOf(badges[b].tier) ||
  badges[a].points - badges[b].points
);
const pause = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

function loadTrips() {
  return accountStore ? accountTrips.filter(trip => score(trip).length) : [];
}

window.addEventListener('account-change', event => {
  accountGeneration++;
  accountStore = event.detail.store;
  accountLoading = event.detail.loading;
  accountTrips = event.detail.trips ?? [];
  guestRoll = null;
  lastRide = null;
  render();
});
window.addEventListener('account-progress', event => {
  if (accountStore !== event.detail.store) accountGeneration++;
  accountStore = event.detail.store;
  accountLoading = false;
  accountTrips = event.detail.trips;
  guestRoll = null;
  render();
});

function badgeList(ids, unlocked) {
  return '<div class="badge-grid">' + ids.map(id => {
    const badge = badges[id];
    const status = unlocked && (unlocked.has(id) ? 'Unlocked' : 'Locked');
    return '<article class="badge ' + badge.tier.toLowerCase() +
      '"><span class="badge-icon" aria-hidden="true">' + badge.icon + '</span><div><span class="tier">' + badge.tier +
      '</span><h3>' + badge.title + '</h3><p>' + badge.description +
      '</p>' + (status ? '<span class="badge-status">' + status + '</span>' : '') +
      '</div><strong>+' + badge.points + '</strong></article>';
  }).join('') + '</div>';
}

function breakdown(trip, heading) {
  const earned = scoreSavedTrip(trip);
  const points = earned.reduce((sum, id) => sum + badges[id].points, 0);
  return '<div class="section-heading"><h2>' + heading + '</h2><span>' + points +
    ' points</span></div>' + badgeList(earned);
}

function render() {
  if (drawing) return;
  const today = dayKey();
  const trips = loadTrips();
  const daily = trips.find(trip => trip.mode === 'draw' && trip.date === today) ??
    (!accountStore && guestRoll?.date === today ? guestRoll : null);
  const unlocked = [...new Set(trips.flatMap(scoreSavedTrip))];
  renderedDay = today;
  byId('date').textContent = dateLabel.format(new Date(today));
  byId('badge-count').textContent = unlocked.length + ' / ' + Object.keys(badges).length;
  byId('generate').disabled = Boolean(daily) || accountLoading;
  byId('draw-state').textContent = daily ? 'DRAW COMPLETE' : 'READY TO DRAW';
  byId('reset-note').textContent = accountLoading ? 'Loading account progress…' :
    accountStore ? (daily ? 'Next draw at midnight in Melbourne.' : 'One account draw per Melbourne day.') :
    'Guest draw · temporary result. Sign in before drawing to save progress.';
  const line = daily && getLine(daily.line);
  byId('draw-content').innerHTML = daily
    ? '<p class="board-kicker">' + line.name + ' line' + (line.eventOnly ? ' · Event service' : '') +
      '</p><h2 id="draw-heading" class="journey"><span>' +
      daily.from + '</span><span class="arrow" aria-label="to">→</span><span>' + daily.to + '</span></h2>' +
      '<p class="train-result">' + (models[daily.model] ?? 'Train model unrecorded') + '</p>'
    : '<p class="board-kicker">TODAY’S TRIP</p><h2 id="draw-heading" class="journey"><span>???</span><span class="arrow" aria-label="to">→</span><span>???</span></h2>';
  byId('daily-badges').innerHTML = daily ? breakdown(daily, 'Draw badges') : '';
  byId('ride-badges').innerHTML = lastRide ? breakdown(lastRide, 'Ride badges') : '';
  renderCollection(unlocked, trips);
  byId('badge-catalogue').innerHTML = '<div class="section-heading"><h2>All badges</h2><span>' +
    unlocked.length + ' of ' + Object.keys(badges).length + ' unlocked</span></div>' +
    badgeList(catalogue, new Set(unlocked));
}

function scoreSavedTrip(trip) {
  const earned = score(trip);
  if (trip.networkVersion || trip.line !== 'frankston' || earned.includes('adjacent')) return earned;
  // The original Frankston list skipped these intermediate stations.
  const oldHop = ['South Yarra|Malvern', 'Highett|Cheltenham', 'Cheltenham|Highett'];
  if (!oldHop.includes(trip.from + '|' + trip.to)) return earned;
  return [...earned, 'adjacent'].sort((a, b) => badges[b].points - badges[a].points);
}

async function revealTrip(trip) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const board = byId('draw-content');
  byId('draw-state').textContent = 'DRAWING TRIP';
  board.setAttribute('aria-busy', 'true');
  board.innerHTML = '<h2 id="draw-heading" class="board-kicker">FINDING YOUR TRIP</h2>' +
    '<div class="roll-grid">' +
    '<div><span class="roll-label">From</span><strong id="roll-from">???</strong></div>' +
    '<div><span class="roll-label">Train</span><strong id="roll-train">???</strong></div>' +
    '<div><span class="roll-label">To</span><strong id="roll-to">???</strong></div></div>';
  const stages = [
    { id: 'roll-from', value: trip.from, choices: stationNames, delays: [45, 55, 75, 105, 155, 230] },
    { id: 'roll-train', value: models[trip.model], choices: Object.values(models), delays: [55, 70, 100, 145, 215, 285] },
    { id: 'roll-to', value: trip.to, choices: stationNames, delays: [65, 80, 105, 145, 205, 290, 385] }
  ];

  for (const { id, value, choices, delays } of stages) {
    const slot = byId(id);
    slot.classList.add('slot-spinning');
    for (const delay of delays) {
      const previous = choices.indexOf(slot.textContent);
      const offset = 1 + Math.floor(Math.random() * (choices.length - 1));
      slot.textContent = choices[(previous + offset) % choices.length];
      await pause(delay);
    }
    slot.textContent = value;
    slot.classList.remove('slot-spinning');
    slot.classList.add('slot-locked');
    await pause(160);
  }
}

function renderCollection(unlocked, trips) {
  const xp = trips.reduce((total, trip) =>
    total + scoreSavedTrip(trip).reduce((points, id) => points + badges[id].points, 0), 0);
  const history = trips.map(trip => {
    const line = getLine(trip.line);
    const day = new Date(trip.date);
    const date = Number.isNaN(day.valueOf()) ? '' : dateLabel.format(day);
    return '<li><span><strong>' + trip.from + ' → ' + trip.to + '</strong><small>' +
      line.name + ' line' + (trip.model ? ' · ' + models[trip.model] : '') + '</small></span><span><strong>' +
      (trip.mode === 'draw' ? 'Daily draw' : 'Logged ride') + '</strong><small>' + date + '</small></span></li>';
  });
  byId('collection-content').innerHTML =
    '<div class="section-heading"><h2>' + xp.toLocaleString('en-AU') +
    ' XP</h2></div><div class="section-heading"><h2>Unlocked badges</h2><span>' + unlocked.length + ' of ' +
    Object.keys(badges).length + '</span></div>' +
    (unlocked.length ? badgeList(unlocked) : '<p class="panel empty">Generate a trip or log a ride to unlock your first badge.</p>') +
    '<div class="section-heading history-heading"><h2>Trip history</h2></div>' +
    (history.length ? '<ul class="panel history">' + history.join('') + '</ul>' : '<p class="panel empty">Your trips will appear here.</p>');
}

function showPage() {
  const pages = ['daily', 'log', 'collection', 'badges', 'account', 'friends'];
  const hash = location.hash.slice(1);
  const page = pages.includes(hash) ? hash : 'daily';
  for (const id of pages) {
    byId(id).hidden = id !== page;
    const link = document.querySelector('[data-page="' + id + '"]');
    if (id === page) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  render();
}

function setStations() {
  const line = getLine(byId('line').value);
  const model = byId('train-model');
  model.replaceChildren(new Option('Unknown', ''));
  model.disabled = !line;
  for (const id of line?.models ?? []) model.add(new Option(models[id], id));
  const from = byId('from');
  from.replaceChildren(new Option('Choose origin', ''));
  from.disabled = !line;
  for (const station of line?.stops ?? []) from.add(new Option(station, station));
  setDestinations();
}

function setDestinations() {
  const line = getLine(byId('line').value);
  const from = byId('from').value;
  const to = byId('to');
  const previous = to.value;
  to.replaceChildren(new Option('Choose destination', ''));
  to.disabled = !from;
  if (!from || !line) return;
  const destinations = getDestinations(line, from);
  for (const station of destinations) to.add(new Option(station, station));
  if (destinations.includes(previous)) to.value = previous;
}

byId('generate').addEventListener('click', async () => {
  if (drawing || accountLoading) return;
  const generation = accountGeneration;
  const store = accountStore;
  drawing = true;
  byId('generate').disabled = true;
  let trip;
  let saveFailed = false;
  try {
    if (store) {
      trip = await store.roll();
    } else if (guestRoll?.date !== dayKey()) {
      trip = draw(dayKey());
      guestRoll = trip;
    }
    if (generation !== accountGeneration) trip = null;
  } catch {
    saveFailed = true;
  }

  const board = byId('draw-content');
  try {
    if (trip) await revealTrip(trip);
  } finally {
    drawing = false;
    render();
    board.removeAttribute('aria-busy');
    if (generation === accountGeneration && trip?.date === dayKey() && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      board.querySelector('.journey').animate([
        { transform: 'scale(.97)', opacity: .75 },
        { transform: 'scale(1)', opacity: 1 }
      ], { duration: 280, easing: 'ease-out' });
      for (const [index, badge] of byId('daily-badges').querySelectorAll('.badge').entries()) {
        badge.animate([
          { opacity: 0, transform: 'translateY(16px) scale(.97)' },
          { opacity: 1, transform: 'translateY(-2px) scale(1.01)', offset: .72 },
          { opacity: 1, transform: 'translateY(0)' }
        ], { duration: 360, delay: 180 + index * 160, easing: 'ease-out', fill: 'backwards' });
      }
    }
    if (saveFailed) byId('reset-note').textContent = 'Could not load or save the account draw. Check your connection and Firebase setup.';
  }
});

byId('line').add(new Option('Choose a line', ''));
for (const service of ['Metro', 'V/Line']) {
  const group = document.createElement('optgroup');
  group.label = service;
  for (const line of lines.filter(line => line.type === service)) {
    group.append(new Option(line.name + (line.eventOnly ? ' (events)' : ''), line.id));
  }
  byId('line').append(group);
}
byId('line').addEventListener('change', setStations);
byId('from').addEventListener('change', setDestinations);
byId('ride-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!accountStore || accountLoading) {
    byId('form-status').textContent = 'Sign in to save rides and earn collection points.';
    return;
  }
  const generation = accountGeneration;
  const trip = { mode: 'ride', date: dayKey(), line: byId('line').value, from: byId('from').value,
    to: byId('to').value, model: byId('train-model').value, ticket: byId('ticket').value };
  if (!score(trip).length) {
    byId('form-status').textContent = 'Choose two different stations and a compatible train model or Unknown.';
    return;
  }
  try {
    await accountStore.saveRide(trip);
    if (generation !== accountGeneration) return;
    lastRide = { ...trip, networkVersion: 1 };
    event.target.reset();
    setStations();
    byId('form-status').textContent = 'Ride saved.';
    render();
  } catch {
    byId('form-status').textContent = 'Could not save the ride. Check browser storage and try again.';
  }
});

window.addEventListener('hashchange', showPage);
window.setInterval(() => {
  if (renderedDay !== dayKey()) render();
}, 1000);
setStations();
showPage();
