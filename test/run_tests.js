const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Absolute paths for files
const indexHtmlPath = path.join(__dirname, '..', 'index.html');
const appJsPath = path.join(__dirname, '..', 'js', 'app.js');
const foodDbPath = path.join(__dirname, '..', 'js', 'food_db.js');
const recipesPath = path.join(__dirname, '..', 'js', 'recipes.js');

console.log('--- RUNNING EASYSILIM RUNTIME ROBUSTNESS TESTS ---');

// 1. Parse index.html to extract IDs
const htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
const idRegex = /id=["']([^"']+)["']/g;
const htmlIds = new Set();
let match;
while ((match = idRegex.exec(htmlContent)) !== null) {
  htmlIds.add(match[1]);
}
console.log(`Loaded ${htmlIds.size} IDs from HTML template.`);

// 2. Define Mock DOM Class
class MockElement {
  constructor(tagName = 'div', id = '', classes = []) {
    this.tagName = tagName;
    this.id = id;
    this.className = classes.join(' ');
    this.classList = {
      add: (c) => {
        const arr = this.className.split(' ').filter(x => x);
        if (!arr.includes(c)) {
          arr.push(c);
          this.className = arr.join(' ');
        }
      },
      remove: (c) => {
        const arr = this.className.split(' ').filter(x => x && x !== c);
        this.className = arr.join(' ');
      },
      contains: (c) => this.className.split(' ').includes(c)
    };
    this.style = {};
    this.childNodes = [this];
    this.children = [];
    this.value = '';
    this.innerText = '';
    this.innerHTML = '';
    this.placeholder = '';
    this.checked = false;
    this.disabled = false;
    this.options = Array.from({length: 10}, () => ({ text: '' }));
  }

  get parentNode() {
    return new MockElement('div', '', []);
  }

  get previousElementSibling() {
    return new MockElement('label', '', []);
  }

  addEventListener(event, callback) {}

  getAttribute(name) {
    if (name === 'data-tab-target') return this.id ? this.id.replace('Tab', '').toLowerCase() : 'dashboard';
    if (name === 'data-cuisine') return 'chinese';
    if (name === 'data-meal') return 'breakfast';
    return '';
  }

  setAttribute(name, value) {
    this[name] = value;
  }

  removeAttribute(name) {
    delete this[name];
  }

  querySelector(sel) {
    return new MockElement('span', '', []);
  }

  appendChild(node) {
    this.children.push(node);
    return node;
  }

  reset() {}

  querySelectorAll(sel) {
    return [new MockElement('span', '', [])];
  }
}

// 3. Test Scenarios Runner Function
function runTestScenario(name, localStorageState, fetchMockResponse) {
  console.log(`\n> Scenario: ${name}`);
  
  // Setup Mock Document & Window globals
  const elementsById = {};
  htmlIds.forEach(id => {
    elementsById[id] = new MockElement('div', id, []);
  });

  const documentMock = {
    addEventListener: (event, callback) => {
      if (event === 'DOMContentLoaded') {
        // Trigger DOMContentLoaded asynchronously after script evaluation
        setTimeout(() => {
          try {
            callback();
            console.log('  [PASS] DOMContentLoaded completed without exceptions.');
          } catch (err) {
            console.error('  [FAIL] Crash in DOMContentLoaded handler:', err);
            process.exit(1);
          }
        }, 0);
      }
    },
    getElementById: (id) => {
      if (elementsById[id]) return elementsById[id];
      elementsById[id] = new MockElement('div', id, []);
      return elementsById[id];
    },
    querySelector: (sel) => {
      if (sel.includes('.nav-item.active') || sel.includes('.mobile-nav-item.active') || sel.includes('.meal-tab.active')) {
        return new MockElement('div', 'dashboardTab', ['active']);
      }
      if (sel.startsWith('#')) {
        return documentMock.getElementById(sel.substring(1));
      }
      return new MockElement('div', '', []);
    },
    querySelectorAll: (sel) => {
      if (sel.includes('[data-tab-target]')) {
        return [
          new MockElement('div', 'dashboardTab', []),
          new MockElement('div', 'eatTab', []),
          new MockElement('div', 'recipeTab', []),
          new MockElement('div', 'sheetTab', []),
          new MockElement('div', 'analyticsTab', []),
          new MockElement('div', 'communityTab', [])
        ];
      }
      if (sel.includes('.cuisine-pill')) return [new MockElement('button', '', ['cuisine-pill'])];
      if (sel.includes('.page-section')) return [new MockElement('section', '', ['page-section'])];
      return [new MockElement('div', '', [])];
    },
    createElement: (tag) => new MockElement(tag),
    createTextNode: (text) => {
      const el = new MockElement('#text');
      el.nodeValue = text;
      return el;
    },
    body: new MockElement('body')
  };

  const localStorageMock = {
    store: { ...localStorageState },
    getItem: (key) => localStorageMock.store[key] || null,
    setItem: (key, val) => { localStorageMock.store[key] = String(val); },
    removeItem: (key) => { delete localStorageMock.store[key]; },
    clear: () => { localStorageMock.store = {}; }
  };

  const navigatorMock = {
    serviceWorker: {
      register: () => Promise.resolve({ scope: '/' })
    },
    onLine: true
  };

  // Bind globals
  global.window = {
    addEventListener: (event, cb) => {},
    navigator: navigatorMock,
    location: { href: 'http://localhost/', reload: () => {} }
  };
  global.document = documentMock;
  global.localStorage = localStorageMock;
  global.navigator = navigatorMock;
  global.fetch = (url, options) => {
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(fetchMockResponse(url, options))
    });
  };
  global.alert = (msg) => console.log(`  [ALERT] ${msg}`);
  
  // Clear require cache to re-evaluate app.js freshly
  delete require.cache[require.resolve(appJsPath)];
  
  const foodDbJs = fs.readFileSync(foodDbPath, 'utf8');
  const recipesJs = fs.readFileSync(recipesPath, 'utf8');
  const appJs = fs.readFileSync(appJsPath, 'utf8');

  // Evaluate scripts
  eval(foodDbJs);
  eval(`(function(module) { ${recipesJs} })(undefined);`);
  eval(appJs);
}

// Scenarios to run
// Scenario 1: Clean Install State
runTestScenario('Scenario 1: Clean Install State', {}, (url) => '');

// Scenario 2: Logged In with Empty/Null Profile State
runTestScenario('Scenario 2: Logged In (Empty Profile)', {
  'weight_loss_current_user': 'newUser'
}, (url) => '');

// Scenario 3: Corrupt Cloud Sync State
runTestScenario('Scenario 3: Corrupt Sync Recovery', {
  'weight_loss_current_user': 'corruptUser',
  'weight_loss_state_user_corruptUser': 'invalid_json_state'
}, (url) => '{{{corrupted_data_that_fails_parsing}');

// Scenario 4: Happy Path (Fully Initialized Profile)
runTestScenario('Scenario 4: Happy Path (Fully Initialized)', {
  'weight_loss_current_user': 'happyUser',
  'weight_loss_state_user_happyUser': JSON.stringify({
    profile: {
      height: 170,
      initialWeight: 75,
      targetWeight: 65,
      targetCalories: 1600,
      age: 28,
      gender: 'female',
      dietPattern: '16_8',
      recipeSeries: 'water_oil',
      unlockedFeatures: ['cloud_sync'],
      pointsMigrated: true
    },
    records: {}
  })
}, (url) => '');

// Final report after timeout
setTimeout(() => {
  console.log('\n--- ALL SCENARIOS COMPLETED SUCCESSFULLY ---');
  process.exit(0);
}, 1000);
