export type ApiAsset = { id: number; name: string; size: number; browser_download_url: string; digest?: string | null };
export type ApiRelease = { id: number; tag_name: string; draft: boolean; prerelease: boolean; upload_url: string; html_url: string; assets: ApiAsset[]; target_commitish?: string };
export class GitHubApi {
  readonly owner: string; readonly repository: string; readonly token: string | null; readonly apiVersion: string; readonly fetchImpl: typeof fetch;
  constructor(owner: string, repository: string, token: string | null, apiVersion = "2022-11-28", fetchImpl: typeof fetch = fetch) {
    this.owner = owner; this.repository = repository; this.token = token; this.apiVersion = apiVersion; this.fetchImpl = fetchImpl;
    if (!/^[A-Za-z0-9-]+$/.test(owner)) throw new Error("Invalid GitHub owner.");
  }
  get base(): string { return "https://api.github.com/repos/" + this.owner + "/" + this.repository; }
  async request(url: string, init: RequestInit = {}): Promise<Response> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": this.apiVersion,
      "User-Agent": "floradoc-release-publisher"
    };
    if (this.token) headers.Authorization = "Bearer " + this.token;
    if (init.headers && !(init.headers instanceof Headers)) Object.assign(headers, init.headers);
    return this.fetchImpl(url, { ...init, headers });
  }
  async json<T>(url: string, init?: RequestInit): Promise<T> {
    if (!this.token) throw new Error("A GitHub token is required for this operation.");
    const response = await this.request(url, init);
    if (!response.ok) throw new Error("GitHub API request failed: HTTP " + response.status + " " + response.statusText + " for " + url.replace(this.base, this.repository));
    return await response.json() as T;
  }
  async getByTag(tag: string): Promise<ApiRelease | null> {
    const response = await this.request(this.base + "/releases/tags/" + encodeURIComponent(tag));
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Could not inspect release tag: HTTP " + response.status);
    return await response.json() as ApiRelease;
  }
  async tagRefExists(tag: string): Promise<boolean> {
    const response = await this.request(this.base + "/git/ref/tags/" + encodeURIComponent(tag));
    if (response.status === 404) return false;
    if (!response.ok) throw new Error("Could not inspect Git tag: HTTP " + response.status);
    return true;
  }
  async createDraft(tag: string, name: string, body: string, prerelease: boolean): Promise<ApiRelease> {
    return this.json<ApiRelease>(this.base + "/releases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag_name: tag, target_commitish: "main", name, body, draft: true, prerelease }) });
  }
  async upload(release: ApiRelease, name: string, bytes: Uint8Array, contentType = "application/octet-stream"): Promise<ApiAsset> {
    if (!this.token) throw new Error("A GitHub token is required to upload release assets.");
    if (release.assets.some((asset) => asset.name === name)) throw new Error("Refusing to overwrite an existing GitHub release asset: " + name);
    const uploadBase = release.upload_url.replace(/\{.*$/, "");
    const body = bytes.slice().buffer as ArrayBuffer;
    const response = await this.request(uploadBase + "?name=" + encodeURIComponent(name), { method: "POST", headers: { "Content-Type": contentType }, body });
    if (!response.ok) throw new Error("Could not upload release asset " + name + ": HTTP " + response.status);
    const uploaded = await response.json() as ApiAsset;
    release.assets.push(uploaded);
    return uploaded;
  }
  async downloadAsset(asset: ApiAsset): Promise<Uint8Array> {
    if (!this.token) throw new Error("A GitHub token is required to verify draft release assets.");
    const response = await this.request(this.base + "/releases/assets/" + asset.id, { headers: { Accept: "application/octet-stream" } });
    if (!response.ok) throw new Error("Could not verify existing release asset " + asset.name + ": HTTP " + response.status);
    return new Uint8Array(await response.arrayBuffer());
  }
}
