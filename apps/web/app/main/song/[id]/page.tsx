type SongDetailPageProps = {
	params: Promise<{ id: string }>;
};

export default async function SongDetailPage({ params }: SongDetailPageProps) {
	const { id } = await params;

	return (
		<div className="p-8 text-white">
			<h1 className="text-2xl font-semibold">Song {id}</h1>
			<p className="mt-2 text-sm text-zinc-400">Trang chi tiet bai hat dang duoc hoan thien.</p>
		</div>
	);
}
