export interface LintMessage {
  line: number;
  column: number;
  severity: "error" | "warning" | "info";
  message: string;
  ruleId: string;
}

export interface LintResult {
  filePath: string;
  messages: LintMessage[];
  fixable?: boolean;
  source?: string;
  output?: string; // If fix was successful and content changed
}
