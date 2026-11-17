const RailGame = ((network) => {
  const lines = network.map(({ patterns, ...line }) => {
    const connections = new Map();
    for (const pattern of patterns) {
      const stops = pattern.split('|').map(value => {
        const marker = value[0];
        return {
          name: /^[<>!]/.test(value) ? value.slice(1) : value,
          pickup: marker !== '<' && marker !== '!',
          dropoff: marker !== '>' && marker !== '!'
        };
      });
      for (const [index, origin] of stops.entries()) {
        if (!origin.pickup) continue;
        for (let next = index + 1; next < stops.length; next++) {
          const destination = stops[next];
          if (!destination.dropoff || origin.name === destination.name) continue;
          if (!connections.has(origin.name)) connections.set(origin.name, new Map());
          const reachable = connections.get(origin.name);
          const legs = next - index;
          reachable.set(destination.name, Math.min(reachable.get(destination.name) ?? Infinity, legs));
        }
      }
    }
    const stops = [...connections.keys()].sort((a, b) => a.localeCompare(b, 'en-AU'));
    return { ...line, stops, connections };
  });

  const models = {
    comeng: 'Comeng',
    xtrapolis100: 'X’Trapolis 100',
    siemens: 'Siemens Nexas',
    highCapacity: 'High Capacity Metro Train',
    xtrapolis2: 'X’Trapolis 2.0',
    vlocity: 'VLocity',
    sprinter: 'Sprinter',
    nset: 'N-Set'
  };
  // Fleet prevalence uses comparable passenger formations where available.
  // X’Trapolis 2.0 is still in rollout, so its tier reflects limited deployment.
  const modelAwards = {
    comeng: { tier: 'Uncommon', points: 125 },
    xtrapolis100: { tier: 'Common', points: 65 },
    siemens: { tier: 'Uncommon', points: 150 },
    highCapacity: { tier: 'Uncommon', points: 110 },
    xtrapolis2: { tier: 'Rare', points: 280 },
    vlocity: { tier: 'Common', points: 60 },
    sprinter: { tier: 'Rare', points: 260 },
    nset: { tier: 'Rare', points: 290 }
  };

  const badges = {
    metro: { title: 'Metro Rider', tier: 'Common', points: 50, icon: '↠', description: 'Travel on a Metro line.' },
    adjacent: { title: 'One Stop Hop', tier: 'Common', points: 75, icon: '↔', description: 'Travel between stations that are consecutive stops on a direct service.' },
    terminus: { title: 'End of the Line', tier: 'Uncommon', points: 120, icon: '⊣', description: 'Start or finish at a line terminus.' },
    regional: { title: 'Regional Runner', tier: 'Uncommon', points: 160, icon: '⇢', description: 'Travel on a V/Line train.' },
    quiet: { title: 'Quiet Platform', tier: 'Rare', points: 250, icon: '◇', description: 'Start or finish at one of the prototype’s quiet-station picks.' },
    paper: { title: 'Paper Trail', tier: 'Rare', points: 300, icon: '▤', description: 'Log a real ride where you used a paper ticket.' },
    alliteration: { title: 'Matching Initials', tier: 'Uncommon', points: 105, icon: 'Aa', description: 'Start and finish at stations with the same first letter.' },
    longHaul: { title: 'Long Haul', tier: 'Rare', points: 310, icon: '⇥', description: 'Take a trip with at least 15 station-to-station legs, even on the shortest direct stopping pattern.' },
    raceDay: { title: 'Race Day', tier: 'Epic', points: 600, icon: '⚑', description: 'Start or finish at Flemington Racecourse on its event line.' },
    tunnel: { title: 'Tunnel Vision', tier: 'Epic', points: 800, icon: '◉', description: 'Start and finish at two of the five Metro Tunnel stations.' },
    swanHillSpecial: { title: 'Swan Hill Special', tier: 'Mythic', points: 1600, icon: '★', description: 'Start or finish at Swan Hill aboard an N-Set.' },
    quietPair: { title: 'Double Quiet', tier: 'Mythic', points: 1800, icon: '◇', description: 'Start and finish at two of the quiet-station picks.' },
    stonyPointEndToEnd: { title: 'Stony Point End to End', tier: 'Mythic', points: 2000, icon: '↔', description: 'Travel the full length of the Stony Point line between Frankston and Stony Point.' },
    compass: { title: 'Compass Flip', tier: 'Anomaly', points: 6000, icon: '✦', description: 'Travel directly between two stations that share a name with opposite compass prefixes, such as North Geelong and South Geelong.' },
    ...Object.fromEntries(Object.entries(models).map(([id, name]) => [id, {
      title: name, icon: '▣', description: 'Get this train model in a draw or log a ride on it.',
      ...modelAwards[id]
    }]))
  };
  const quietStops = new Set(['Gardenvale', 'Ripponlea', 'Patterson', 'Kananook', 'Middle Footscray', 'Diggers Rest', 'Ardeer', 'Ballan']);
  const tunnelStops = new Set(['Arden', 'Parkville', 'State Library', 'Town Hall', 'Anzac']);
  const oppositeDirections = { North: 'South', South: 'North', East: 'West', West: 'East' };
  const termini = {
    sandringham: ['Flinders Street', 'Sandringham'], pakenham: ['East Pakenham'],
    ballarat: ['Southern Cross', 'Ballarat', 'Wendouree'],
    bendigo: ['Southern Cross', 'Bendigo', 'Eaglehawk', 'Epsom'],
    geelong: ['Southern Cross', 'Geelong', 'South Geelong', 'Waurn Ponds']
  };
  const melbourne = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne', year: 'numeric', month: '2-digit', day: '2-digit'
  });

  function dayKey(now = new Date()) {
    const parts = Object.fromEntries(melbourne.formatToParts(now).map(({ type, value }) => [type, value]));
    return [parts.year, parts.month, parts.day].join('-');
  }

  function getLine(id) {
    return lines.find(line => line.id === id);
  }

  function score(trip) {
    const line = getLine(trip.line);
    const legs = line?.connections.get(trip.from)?.get(trip.to);
    if (legs === undefined || (trip.model && !line.models.includes(trip.model))) return [];

    const { from, to } = trip;
    const earned = [line.type === 'Metro' ? 'metro' : 'regional'];
    if (trip.model) earned.push(trip.model);
    if (legs === 1) earned.push('adjacent');
    const endpoints = termini[line.id] ?? (line.type === 'Metro' ? [line.name] : ['Southern Cross', line.name]);
    if (endpoints.includes(from) || endpoints.includes(to)) earned.push('terminus');
    if (quietStops.has(from) || quietStops.has(to)) earned.push('quiet');
    if (trip.mode === 'ride' && trip.ticket === 'paper') earned.push('paper');
    if (from[0] === to[0]) earned.push('alliteration');
    if (legs >= 15) earned.push('longHaul');
    if (tunnelStops.has(from) && tunnelStops.has(to)) earned.push('tunnel');
    if (quietStops.has(from) && quietStops.has(to)) earned.push('quietPair');
    if (line.id === 'flemington' && [from, to].includes('Flemington Racecourse')) earned.push('raceDay');
    if (line.id === 'stony-point' && [from, to].includes('Frankston') && [from, to].includes('Stony Point')) {
      earned.push('stonyPointEndToEnd');
    }
    if (trip.model === 'nset' && [from, to].includes('Swan Hill')) earned.push('swanHillSpecial');
    const [direction, ...place] = from.split(' ');
    if (Object.hasOwn(oppositeDirections, direction) && to === [oppositeDirections[direction], ...place].join(' ')) {
      earned.push('compass');
    }
    return earned.sort((a, b) => badges[b].points - badges[a].points);
  }

  function draw(date, random = Math.random) {
    const pool = random() < 0.2 ? lines.filter(line => line.type === 'V/Line') : lines.filter(line => line.type === 'Metro');
    const line = pool[Math.floor(random() * pool.length)];
    const from = line.stops[Math.floor(random() * line.stops.length)];
    const model = line.models[Math.floor(random() * line.models.length)];
    const destinations = getDestinations(line, from);
    const to = destinations[Math.floor(random() * destinations.length)];
    return { mode: 'draw', date, line: line.id, model, from, to };
  }

  function getDestinations(line, from) {
    return [...(line.connections.get(from)?.keys() ?? [])].sort((a, b) => a.localeCompare(b, 'en-AU'));
  }

  return { lines, models, badges, dayKey, getLine, getDestinations, score, draw };
})(typeof module !== 'undefined' ? require('./network.js') : RailNetwork);

if (typeof module !== 'undefined') module.exports = RailGame;
