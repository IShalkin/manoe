/**
 * Unit Tests for AuthMiddleware
 * 
 * Tests JWT token extraction, verification, and user context management
 */

import jwt from "jsonwebtoken";
import { AuthMiddleware, UserContext } from "../middleware/AuthMiddleware";

describe("AuthMiddleware", () => {
  const MOCK_JWT_SECRET = "test-secret-key-12345";
  const MOCK_USER_ID = "user-123";
  const MOCK_EMAIL = "test@example.com";
  
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Save original environment variable
    originalEnv = process.env.SUPABASE_JWT_SECRET;
    // Set test JWT secret
    process.env.SUPABASE_JWT_SECRET = MOCK_JWT_SECRET;
  });

  afterEach(() => {
    // Restore original environment variable
    if (originalEnv !== undefined) {
      process.env.SUPABASE_JWT_SECRET = originalEnv;
    } else {
      delete process.env.SUPABASE_JWT_SECRET;
    }
  });

  describe("JWT Token Extraction", () => {
    it("should extract user context from valid JWT token", () => {
      const middleware = new AuthMiddleware();
      const token = jwt.sign(
        { sub: MOCK_USER_ID, email: MOCK_EMAIL, role: "authenticated" },
        MOCK_JWT_SECRET
      );

      const mockReq = {
        path: "/api/projects",
        headers: {
          authorization: `Bearer ${token}`,
        },
        userContext: undefined,
      } as any;

      const mockRes = {} as any;
      const mockNext = jest.fn();
      const mockContext = {} as any;

      middleware.use(mockReq, mockRes, mockNext, mockContext);

      expect(mockReq.userContext).toBeDefined();
      expect(mockReq.userContext?.userId).toBe(MOCK_USER_ID);
      expect(mockReq.userContext?.email).toBe(MOCK_EMAIL);
      expect(mockReq.userContext?.role).toBe("authenticated");
      expect(mockNext).toHaveBeenCalled();
    });

    it("should not extract user context from invalid JWT token", () => {
      const middleware = new AuthMiddleware();
      const invalidToken = "invalid.jwt.token";

      const mockReq = {
        path: "/api/projects",
        headers: {
          authorization: `Bearer ${invalidToken}`,
        },
        userContext: undefined,
      } as any;

      const mockRes = {} as any;
      const mockNext = jest.fn();
      const mockContext = {} as any;

      middleware.use(mockReq, mockRes, mockNext, mockContext);

      expect(mockReq.userContext).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it("should not extract user context from expired JWT token", () => {
      const middleware = new AuthMiddleware();
      const expiredToken = jwt.sign(
        { sub: MOCK_USER_ID, email: MOCK_EMAIL, exp: Math.floor(Date.now() / 1000) - 3600 },
        MOCK_JWT_SECRET
      );

      const mockReq = {
        path: "/api/projects",
        headers: {
          authorization: `Bearer ${expiredToken}`,
        },
        userContext: undefined,
      } as any;

      const mockRes = {} as any;
      const mockNext = jest.fn();
      const mockContext = {} as any;

      middleware.use(mockReq, mockRes, mockNext, mockContext);

      expect(mockReq.userContext).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it("should handle missing authorization header", () => {
      const middleware = new AuthMiddleware();

      const mockReq = {
        path: "/api/projects",
        headers: {},
        userContext: undefined,
      } as any;

      const mockRes = {} as any;
      const mockNext = jest.fn();
      const mockContext = {} as any;

      middleware.use(mockReq, mockRes, mockNext, mockContext);

      expect(mockReq.userContext).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });

    it("should skip authentication for exempt paths", () => {
      const middleware = new AuthMiddleware();

      const mockReq = {
        path: "/health",
        headers: {},
        userContext: undefined,
      } as any;

      const mockRes = {} as any;
      const mockNext = jest.fn();
      const mockContext = {} as any;

      middleware.use(mockReq, mockRes, mockNext, mockContext);

      expect(mockReq.userContext).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("requireAuth helper", () => {
    it("should return user context when authenticated", () => {
      const mockUserContext: UserContext = {
        userId: MOCK_USER_ID,
        email: MOCK_EMAIL,
        role: "authenticated",
      };

      const mockReq = {
        userContext: mockUserContext,
      } as any;

      const result = AuthMiddleware.requireAuth(mockReq);
      expect(result).toEqual(mockUserContext);
    });

    it("should throw error when not authenticated", () => {
      const mockReq = {
        userContext: undefined,
      } as any;

      expect(() => AuthMiddleware.requireAuth(mockReq)).toThrow("Authentication required");
    });
  });

  describe("verifyOwnership helper", () => {
    it("should not throw when user owns the project", () => {
      const mockUserContext: UserContext = {
        userId: MOCK_USER_ID,
        email: MOCK_EMAIL,
      };

      const mockReq = {
        userContext: mockUserContext,
      } as any;

      const mockProject = {
        user_id: MOCK_USER_ID,
      };

      expect(() => AuthMiddleware.verifyOwnership(mockReq, mockProject)).not.toThrow();
    });

    it("should throw when user does not own the project", () => {
      const mockUserContext: UserContext = {
        userId: MOCK_USER_ID,
        email: MOCK_EMAIL,
      };

      const mockReq = {
        userContext: mockUserContext,
      } as any;

      const mockProject = {
        user_id: "different-user-id",
      };

      expect(() => AuthMiddleware.verifyOwnership(mockReq, mockProject)).toThrow(
        "Access denied: You do not own this project"
      );
    });

    it("should throw when project has no owner", () => {
      const mockUserContext: UserContext = {
        userId: MOCK_USER_ID,
        email: MOCK_EMAIL,
      };

      const mockReq = {
        userContext: mockUserContext,
      } as any;

      const mockProject = {};

      expect(() => AuthMiddleware.verifyOwnership(mockReq, mockProject)).toThrow(
        "Project does not have an owner"
      );
    });

    it("should throw when user is not authenticated", () => {
      const mockReq = {
        userContext: undefined,
      } as any;

      const mockProject = {
        user_id: MOCK_USER_ID,
      };

      expect(() => AuthMiddleware.verifyOwnership(mockReq, mockProject)).toThrow(
        "Authentication required"
      );
    });
  });

  describe("JWT Secret Configuration", () => {
    it("should handle missing JWT secret gracefully", () => {
      delete process.env.SUPABASE_JWT_SECRET;
      
      const middleware = new AuthMiddleware();
      const token = jwt.sign(
        { sub: MOCK_USER_ID, email: MOCK_EMAIL },
        MOCK_JWT_SECRET
      );

      const mockReq = {
        path: "/api/projects",
        headers: {
          authorization: `Bearer ${token}`,
        },
        userContext: undefined,
      } as any;

      const mockRes = {} as any;
      const mockNext = jest.fn();
      const mockContext = {} as any;

      middleware.use(mockReq, mockRes, mockNext, mockContext);

      // Should not extract user context without secret
      expect(mockReq.userContext).toBeUndefined();
      // But should still call next (non-blocking)
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
