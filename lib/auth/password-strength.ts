export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: "Very weak" | "Weak" | "Fair" | "Strong" | "Very strong";
  checks: {
    length: boolean;
    upperAndLower: boolean;
    number: boolean;
    symbol: boolean;
  };
}

export function getPasswordStrength(password: string): PasswordStrength {
  const checks = {
    length: password.length >= 8,
    upperAndLower: /[a-z]/.test(password) && /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  const score = (password.length === 0 ? 0 : Math.min(4, passed)) as PasswordStrength["score"];
  const labels: PasswordStrength["label"][] = ["Very weak", "Weak", "Fair", "Strong", "Very strong"];
  return { score, label: labels[score], checks };
}

export function isStrongEnough(password: string): boolean {
  return getPasswordStrength(password).score >= 3;
}
