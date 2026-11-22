// Inventaris. Nu nog klein (kaart en kompas), maar bedoeld als basis voor later:
// zakboekje, veldfles, schaduwstok, seinlamp ... Elk voorwerp is gewoon een id met wat gegevens.

export class Inventory {
  constructor(events) {
    this.events = events;
    this.items = new Map();
  }
  add(id, data = {}) {
    if (this.items.has(id)) return false;
    this.items.set(id, { id, ...data });
    this.events.emit('inventory:add', { id });
    return true;
  }
  has(id) { return this.items.has(id); }
  get(id) { return this.items.get(id); }
  list() { return [...this.items.values()]; }
}
