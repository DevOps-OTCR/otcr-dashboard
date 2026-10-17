-- Preserve the original request while recording the role actually granted.
ALTER TABLE "OnboardingRequest" ADD COLUMN "grantedRole" "Role";

-- Before this change, approval always granted the requested role.
UPDATE "OnboardingRequest" SET "grantedRole" = "requestedRole" WHERE "status" = 'APPROVED';
