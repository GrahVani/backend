// Test setup
process.env.NODE_ENV = "test";
// Using TEST_ prefix to avoid gitleaks detection - this is a mock secret for testing only
process.env.JWT_SECRET = "TESTONLY_not_a_real_secret_32chars";
process.env.DATABASE_URL = "postgresql://mock:mock@localhost:5432/mock";
