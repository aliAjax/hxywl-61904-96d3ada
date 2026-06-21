type TestFn = () => void | Promise<void>;

interface TestCase {
  name: string;
  fn: TestFn;
  suite: string;
}

const tests: TestCase[] = [];
let currentSuite = "";

export function suite(name: string, fn: () => void): void {
  const prev = currentSuite;
  currentSuite = name;
  fn();
  currentSuite = prev;
}

export function test(name: string, fn: TestFn): void {
  tests.push({ name, fn, suite: currentSuite });
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(
      message || `断言失败：期望值 ${e}，实际值 ${a}`
    );
  }
}

export function assertNotEqual<T>(actual: T, expected: T, message?: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    throw new Error(
      message || `断言失败：值不应该等于 ${e}`
    );
  }
}

export function assertTrue(value: boolean, message?: string): void {
  if (value !== true) {
    throw new Error(message || `断言失败：期望 true，实际值 ${JSON.stringify(value)}`);
  }
}

export function assertFalse(value: boolean, message?: string): void {
  if (value !== false) {
    throw new Error(message || `断言失败：期望 false，实际值 ${JSON.stringify(value)}`);
  }
}

export function assertThrows(fn: () => unknown, message?: string): void {
  let thrown = false;
  try {
    fn();
  } catch {
    thrown = true;
  }
  if (!thrown) {
    throw new Error(message || "断言失败：期望抛出异常，但没有抛出");
  }
}

export async function assertAsyncThrows(fn: () => Promise<unknown>, message?: string): Promise<void> {
  let thrown = false;
  try {
    await fn();
  } catch {
    thrown = true;
  }
  if (!thrown) {
    throw new Error(message || "断言失败：期望抛出异常，但没有抛出");
  }
}

export async function runTests(): Promise<{ passed: number; failed: number }> {
  let passed = 0;
  let failed = 0;
  let lastSuite = "";

  for (const t of tests) {
    if (t.suite !== lastSuite) {
      if (lastSuite) console.log();
      console.log(`\x1b[1m▸ ${t.suite}\x1b[0m`);
      lastSuite = t.suite;
    }
    try {
      await t.fn();
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${t.name}`);
    } catch (err: any) {
      failed++;
      console.log(`  \x1b[31m✗\x1b[0m ${t.name}`);
      console.log(`    \x1b[31m${err?.message || String(err)}\x1b[0m`);
    }
  }

  console.log();
  console.log(`\x1b[1m结果：\x1b[0m\x1b[32m${passed} 通过\x1b[0m，\x1b[31m${failed} 失败\x1b[0m`);
  return { passed, failed };
}
