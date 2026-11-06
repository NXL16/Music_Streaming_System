export function NotFoundState() {
  return (
    <div className="not-found-state items-center text-(--systemSecondary) flex flex-col gap-3 left-1/2 m-auto max-w-110 px-6.25 absolute text-center top-1/2 -translate-x-1/2 -translate-y-1/2 z-(--z-default)">
      <h1 className="[font:var(--title-2)] mb-1.25">
        The page you&apos;re looking for can&apos;t be found.
      </h1>
    </div>
  );
}
