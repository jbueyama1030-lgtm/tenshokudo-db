-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "condAccident" TEXT,
ADD COLUMN     "condAge64" TEXT,
ADD COLUMN     "condAgeRange" TEXT,
ADD COLUMN     "condAppearance" TEXT,
ADD COLUMN     "condDorm" BOOLEAN,
ADD COLUMN     "condFemale" TEXT,
ADD COLUMN     "condFemaleFacility" BOOLEAN,
ADD COLUMN     "condForeign" TEXT,
ADD COLUMN     "condGuarantor" BOOLEAN,
ADD COLUMN     "condHiringStandard" TEXT,
ADD COLUMN     "condHousingSupport" BOOLEAN,
ADD COLUMN     "condIdealPerson" TEXT,
ADD COLUMN     "condJobChangeLimit" BOOLEAN,
ADD COLUMN     "condLgbtq" TEXT,
ADD COLUMN     "condMedicalHistory" TEXT,
ADD COLUMN     "condNote" TEXT,
ADD COLUMN     "condRetirementAge" TEXT,
ADD COLUMN     "condSpecialTrain" TEXT,
ADD COLUMN     "condTattoo" TEXT,
ADD COLUMN     "condWorkSide" TEXT,
ADD COLUMN     "hasReferralContract" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "referralFees" JSONB;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "roles" TEXT[] DEFAULT ARRAY[]::TEXT[];
