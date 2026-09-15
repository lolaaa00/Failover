import { z } from "zod";
import { validatePublicUrl } from "./urls";

const httpsUrlSchema = z
  .string()
  .min(1, "required")
  .max(512, "too long")
  .refine(
    (value) => {
      try {
        validatePublicUrl(value);
        return true;
      } catch {
        return false;
      }
    },
    { message: "must be a well-formed https:// URL, not localhost/private, no embedded credentials" },
  );

export const registerProjectSchema = z
  .object({
    projectId: z
      .string()
      .min(3)
      .max(64)
      .regex(/^[a-z0-9-]+$/, "lowercase letters, digits, hyphens only"),
    name: z.string().min(1).max(128),
    frontendUrl: httpsUrlSchema,
    releaseUrl: httpsUrlSchema,
    incidentUrl: httpsUrlSchema,
    expectedAddress: z.string().max(256),
    checkCooldownSeconds: z.number().int().min(300).max(86_400),
    staleReleasePolicy: z.enum(["RESTRICTED", "RECOVERY_PENDING"]),
    unavailablePolicy: z.enum(["RESTRICTED", "RECOVERY_PENDING"]),
  })
  .superRefine((data, ctx) => {
    const urls = [data.frontendUrl, data.releaseUrl, data.incidentUrl].map((url) => validatePublicUrl(url));
    if (new Set(urls).size !== urls.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "frontend, release, and incident URLs must all be distinct",
        path: ["frontendUrl"],
      });
    }
  });

export type RegisterProjectInput = z.infer<typeof registerProjectSchema>;

export const submitRecoverySchema = z.object({
  projectId: z.string().min(1),
  newReleaseUrl: httpsUrlSchema,
  newFrontendUrl: z.union([httpsUrlSchema, z.literal("")]).optional(),
  recoveryDescription: z.string().min(10, "describe what was fixed").max(2000),
});

export type SubmitRecoveryInput = z.infer<typeof submitRecoverySchema>;

export const actionHashSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^0x[0-9a-fA-F]+$/, "must be a 0x-prefixed hex hash");
