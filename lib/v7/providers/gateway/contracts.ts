export type ProviderCapabilities = {
  media: 'video' | 'image' | 'voice';
  maxDurationSeconds?: number;
  aspectRatios?: string[];
  resolutions?: string[];
  supportsImageReference?: boolean;
  supportsAudioReference?: boolean;
  supportsSeed?: boolean;
};

export type ProviderEstimate = {
  provider: string;
  estimatedCostUsd: number;
  units?: number;
  currency: 'USD';
};

export type ProviderTask = {
  provider: string;
  taskId: string;
  state: 'submitted' | 'processing' | 'succeeded' | 'failed';
};

export type ProviderTaskStatus = ProviderTask & {
  failureClassification?: 'safe-no-charge' | 'billing-risk-unknown' | 'provider-rejected';
  outputUrls?: string[];
};

export type DownloadedAsset = {
  bytes: Uint8Array;
  mimeType: string;
  sourceUrl?: string;
};

export interface MediaProvider<TRequest = unknown> {
  readonly id: string;
  capabilities(): Promise<ProviderCapabilities>;
  estimate(request: TRequest): Promise<ProviderEstimate>;
  submit(request: TRequest): Promise<ProviderTask>;
  status(taskId: string): Promise<ProviderTaskStatus>;
  download(taskId: string): Promise<DownloadedAsset>;
}

export interface VideoProvider<TRequest = unknown> extends MediaProvider<TRequest> {}
export interface ImageProvider<TRequest = unknown> extends MediaProvider<TRequest> {}
export interface VoiceProvider<TRequest = unknown> extends MediaProvider<TRequest> {}
