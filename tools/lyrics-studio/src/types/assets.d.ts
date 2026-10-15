declare module "*.css";
declare module "*.module.css";
declare module "*?worker" {
	const workerConstructor: {
		new (): Worker;
	};
	export default workerConstructor;
}
declare module "*?worker&url" {
	const workerUrl: string;
	export default workerUrl;
}
declare module "*?url" {
	const assetUrl: string;
	export default assetUrl;
}
