import fs from "fs";
import path from "path";

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

function runReleaseCheck(): void {
  const rootDir = path.resolve(__dirname, "..");
  const results: CheckResult[] = [];

  console.log("🔍 Running SIH Smart Tourism Backend Release Candidate Audit...\n");

  // 1. Check compiled release bundle (dist/)
  const distDir = path.join(rootDir, "dist");
  const serverJs = path.join(distDir, "server.js");
  const appJs = path.join(distDir, "app.js");

  const distExists = fs.existsSync(distDir) && fs.existsSync(serverJs) && fs.existsSync(appJs);
  results.push({
    name: "Release Artifact Bundle (dist/)",
    passed: distExists,
    message: distExists
      ? "dist/ compiled successfully with server.js and app.js"
      : "dist/ directory or compiled entrypoints missing (run 'npm run build' first)"
  });

  // 2. Check package.json metadata and scripts
  const packageJsonPath = path.join(rootDir, "package.json");
  let packageJsonValid = false;
  let packageMsg = "";
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      const requiredScripts = ["build", "start", "lint", "format:check", "test", "release:check", "smoke:test"];
      const missingScripts = requiredScripts.filter((s) => !pkg.scripts?.[s]);

      if (missingScripts.length > 0) {
        packageMsg = `Missing scripts in package.json: ${missingScripts.join(", ")}`;
      } else if (!pkg.engines?.node) {
        packageMsg = "Missing 'engines.node' requirement in package.json";
      } else if (!pkg.main || pkg.main !== "dist/server.js") {
        packageMsg = "package.json 'main' must point to 'dist/server.js'";
      } else {
        packageJsonValid = true;
        packageMsg = `Valid package.json (v${pkg.version}, Node engine: ${pkg.engines.node})`;
      }
    } catch (e: unknown) {
      packageMsg = `Failed to parse package.json: ${(e as Error).message}`;
    }
  } else {
    packageMsg = "package.json not found";
  }
  results.push({
    name: "Package Configuration & Engines",
    passed: packageJsonValid,
    message: packageMsg
  });

  // 3. Check .env.example completeness and safety
  const envExamplePath = path.join(rootDir, ".env.example");
  let envValid = false;
  let envMsg = "";
  if (fs.existsSync(envExamplePath)) {
    const content = fs.readFileSync(envExamplePath, "utf-8");
    const requiredVars = [
      "PORT",
      "NODE_ENV",
      "SUPABASE_URL",
      "SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "GEMINI_API_KEY"
    ];
    const missingVars = requiredVars.filter((v) => !content.includes(v));

    // Ensure no real secrets or live service role keys in .env.example
    const containsRealSecret =
      content.includes("eyJh") ||
      content.includes("AIzaSy") ||
      (content.includes("sbp_") && !content.includes("your-"));

    if (missingVars.length > 0) {
      envMsg = `Missing variable placeholders in .env.example: ${missingVars.join(", ")}`;
    } else if (containsRealSecret) {
      envMsg = "CRITICAL: Real secret/token detected in .env.example template!";
    } else {
      envValid = true;
      envMsg = ".env.example template complete and properly sanitized";
    }
  } else {
    envMsg = ".env.example missing";
  }
  results.push({
    name: "Environment Template Security (.env.example)",
    passed: envValid,
    message: envMsg
  });

  // 4. Check .gitignore rules
  const gitignorePath = path.join(rootDir, ".gitignore");
  let gitignoreValid = false;
  let gitignoreMsg = "";
  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    const requiredRules = [".env", "node_modules/", "dist/"];
    const missingRules = requiredRules.filter((r) => !gitignoreContent.includes(r));

    if (missingRules.length > 0) {
      gitignoreMsg = `Missing rules in .gitignore: ${missingRules.join(", ")}`;
    } else {
      gitignoreValid = true;
      gitignoreMsg = ".gitignore properly excludes .env, node_modules, and dist";
    }
  } else {
    gitignoreMsg = ".gitignore missing";
  }
  results.push({
    name: "Git Repository Hygiene (.gitignore)",
    passed: gitignoreValid,
    message: gitignoreMsg
  });

  // Print Summary Table
  let allPassed = true;
  for (const r of results) {
    const symbol = r.passed ? "✅ PASS" : "❌ FAIL";
    console.log(`[${symbol}] ${r.name}: ${r.message}`);
    if (!r.passed) {
      allPassed = false;
    }
  }

  console.log("\n---------------------------------------------------------");
  if (allPassed) {
    console.log("🎉 Release candidate audit PASSED. Ready for deployment.");
    process.exit(0);
  } else {
    console.error("❌ Release candidate audit FAILED. Please resolve issues above.");
    process.exit(1);
  }
}

runReleaseCheck();
