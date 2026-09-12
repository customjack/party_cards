export function cardsToPick(prompt: string) {
  const blanks = prompt.match(/_{2,}/g)?.length ?? 0;
  return Math.max(1, blanks);
}
