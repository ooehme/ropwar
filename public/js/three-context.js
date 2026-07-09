let threeModule = null;

export function setThreeModule(module) {
  threeModule = module;
}

export function getThree() {
  if (!threeModule) {
    throw new Error('Three.js wurde noch nicht initialisiert.');
  }
  return threeModule;
}

export function hasThreeModule() {
  return Boolean(threeModule);
}
