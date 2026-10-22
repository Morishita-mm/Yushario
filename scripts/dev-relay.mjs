// Keep source-mode startup failures as short and fatal as the built bin's errors.
try {
  await import("../src/server/relay.ts");
} catch (error) {
  const message = (error instanceof Error ? error.message : String(error)).split(/[\r\n]/)[0];
  console.error(`Could not start yushario: ${message}`);
  console.error("yushario を起動できませんでした。起動オプションと待受アドレスを確認してください。");
  if (process.env.YUSHARIO_DEBUG === "1") console.error(error);
  // A failed import may already own listeners; never keep a half-started relay alive.
  process.exit(1);
}
