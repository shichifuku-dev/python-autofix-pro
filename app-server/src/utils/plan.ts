export type InstallationPlan = "free" | "pro";

const parseProInstallationIds = (): Set<number> => {
  const rawIds = process.env.PRO_INSTALLATION_IDS;
  if (!rawIds) {
    return new Set<number>();
  }

  return new Set(
    rawIds
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value)),
  );
};

const PRO_INSTALLATION_IDS = parseProInstallationIds();

export const getPlanForInstallation = (installationId: number): InstallationPlan => {
  return PRO_INSTALLATION_IDS.has(installationId) ? "pro" : "free";
};
