import {
  fetchFamilyBoats,
  fetchFamilyBoatById,
  fetchBoatLocation,
  fetchBoatTrips,
  fetchTripById,
  fetchBoatIncidents,
  fetchIncidentById,
  loginFamily,
  fetchCurrentUser,
  logoutFamily,
  localStore,
} from "../../lib/family/familyApi";

describe("familyApi client", () => {
  const originalEnv = process.env.NEXT_PUBLIC_ENABLE_DEMO_SIMULATOR;

  afterEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_DEMO_SIMULATOR = originalEnv;
    jest.clearAllMocks();
  });

  describe("Fallback and localStore behavior (Demo Simulator mode)", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_ENABLE_DEMO_SIMULATOR = "true";
    });

    it("returns family boats when in demo mode", async () => {
      const boats = await fetchFamilyBoats();
      expect(Array.isArray(boats)).toBe(true);
      expect(boats.length).toBeGreaterThan(0);
      expect(boats[0]).toHaveProperty("boatId");
      expect(boats[0]).toHaveProperty("name");
      expect(boats[0]).toHaveProperty("safetyStatus");
    });

    it("fetches boat by ID or boatId identifier", async () => {
      const boats = await fetchFamilyBoats();
      const target = boats[0];
      const found = await fetchFamilyBoatById(target.boatId);
      expect(found).not.toBeNull();
      expect(found?.boatId).toBe(target.boatId);
    });

    it("returns null for non-existent boat ID", async () => {
      const found = await fetchFamilyBoatById("INVALID_ID_9999");
      expect(found).toBeNull();
    });

    it("retrieves current or latest location for a boat", async () => {
      const boats = await fetchFamilyBoats();
      const boatId = boats[0].boatId;
      const location = await fetchBoatLocation(boatId);
      expect(location).not.toBeNull();
      expect(typeof location?.latitude).toBe("number");
      expect(typeof location?.longitude).toBe("number");
      expect(location?.timestamp).toBeDefined();
    });

    it("retrieves trip history for a boat", async () => {
      const boats = await fetchFamilyBoats();
      const boatId = boats[0].boatId;
      const trips = await fetchBoatTrips(boatId);
      expect(Array.isArray(trips)).toBe(true);
      if (trips.length > 0) {
        expect(trips[0].boatId.toLowerCase()).toBe(boatId.toLowerCase());
        const singleTrip = await fetchTripById(boatId, trips[0].id);
        expect(singleTrip).not.toBeNull();
        expect(singleTrip?.id).toBe(trips[0].id);
      }
    });

    it("retrieves incidents and incident by ID", async () => {
      const boats = await fetchFamilyBoats();
      const boatId = boats[0].boatId;
      const incidents = await fetchBoatIncidents(boatId);
      expect(Array.isArray(incidents)).toBe(true);

      if (incidents.length > 0) {
        const incident = await fetchIncidentById(incidents[0].id);
        expect(incident).not.toBeNull();
        expect(incident?.id).toBe(incidents[0].id);
        expect(incident?.status).toBeDefined();
      }
    });

    it("updates boat location via localStore", () => {
      const boats = localStore.getBoats();
      const testBoat = boats[0];
      const newLoc = {
        latitude: 16.5,
        longitude: 82.3,
        timestamp: new Date().toISOString(),
        isLive: true,
      };

      const updated = localStore.updateBoatLocation(testBoat.boatId, newLoc);
      expect(updated).not.toBeNull();
      expect(updated?.latestLocation?.latitude).toBe(16.5);
      expect(updated?.latestLocation?.longitude).toBe(82.3);
      expect(updated?.connectionStatus).toBe("CONNECTED");
    });

    it("updates boat safety status and active incident via localStore", () => {
      const boats = localStore.getBoats();
      const testBoat = boats[0];
      const updated = localStore.setBoatStatus(testBoat.boatId, "EMERGENCY", "INC-TEST-01");
      expect(updated?.safetyStatus).toBe("EMERGENCY");
      expect(updated?.activeIncidentId).toBe("INC-TEST-01");
    });
  });

  describe("Production Backend API integration mode", () => {
    beforeEach(() => {
      process.env.NEXT_PUBLIC_ENABLE_DEMO_SIMULATOR = "false";
    });

    it("calls /api/family/boats with auth headers and returns data", async () => {
      const mockBoats = [{ boatId: "AP-07-FISH-12", name: "Matsya Ratna", safetyStatus: "SAFE" }];
      // @ts-ignore
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockBoats,
      });

      const result = await fetchFamilyBoats();
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/family/boats"),
        expect.objectContaining({
          headers: expect.objectContaining({ "Content-Type": "application/json" }),
        })
      );
      expect(result).toEqual(mockBoats);
    });

    it("throws descriptive error when backend API fails", async () => {
      // @ts-ignore
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: "Unauthorized",
        json: async () => ({ detail: "Token expired" }),
      });

      await expect(fetchFamilyBoats()).rejects.toThrow("Token expired");
    });

    it("calls /api/auth/login and returns auth payload matching backend contract", async () => {
      const mockBackendResponse = {
        access_token: "jwt_token_123",
        token: "jwt_token_123",
        token_type: "bearer",
        user: { id: "u1", name: "Lakshmi Rao", role: "FAMILY", authorizedBoatIds: ["AP-07-FISH-12"], assignedBoatIds: ["AP-07-FISH-12"] },
      };
      // @ts-ignore
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockBackendResponse,
      });

      const result = await loginFamily("family@jalari.in", "Password123!");
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/auth/login"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            email: "family@jalari.in",
            identifier: "family@jalari.in",
            password: "Password123!",
          }),
        })
      );
      expect(result.access_token).toBe("jwt_token_123");
      expect(result.token).toBe("jwt_token_123");
      expect(result.user.role).toBe("FAMILY");
    });

    it("returns null for fetchCurrentUser when endpoint returns error", async () => {
      // @ts-ignore
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        statusText: "Unauthorized",
        json: async () => ({ detail: "Not authenticated" }),
      });

      const user = await fetchCurrentUser();
      expect(user).toBeNull();
    });

    it("logoutFamily clears local storage", async () => {
      localStorage.setItem("jalari_token", "dummy_token");
      localStorage.setItem("jalari_user", JSON.stringify({ id: "1" }));
      // @ts-ignore
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      await logoutFamily();
      expect(localStorage.getItem("jalari_token")).toBeNull();
      expect(localStorage.getItem("jalari_user")).toBeNull();
    });
  });
});
