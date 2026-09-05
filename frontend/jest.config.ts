import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "jest-environment-jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^leaflet$": "<rootDir>/__mocks__/leaflet.ts",
    "^leaflet/dist/leaflet.css$": "<rootDir>/__mocks__/styleMock.ts",
    "\\.(css|less|scss|sass)$": "<rootDir>/__mocks__/styleMock.ts",
  },
  transform: {
    "^.+\\.(ts|tsx)$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  testMatch: ["<rootDir>/__tests__/**/*.test.[jt]s?(x)"],
};

export default config;
