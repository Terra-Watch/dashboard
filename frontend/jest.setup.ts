import "@testing-library/jest-dom";

// Polyfill or mock global.fetch in Jest jsdom environment
if (typeof global.fetch === "undefined") {
  // @ts-ignore
  global.fetch = jest.fn();
}
