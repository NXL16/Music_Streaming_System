export type GoogleCodeResponse = {
  code?: string;
  scope?: string;
  authuser?: string;
  prompt?: string;
  error?: string;
  error_description?: string;
  error_uri?: string;
};

type GoogleCodeClient = {
  requestCode: () => void;
};

type GoogleOAuth2 = {
  initCodeClient: (config: {
    client_id: string;
    scope: string;
    ux_mode: "popup";
    callback: (response: GoogleCodeResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => GoogleCodeClient;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: GoogleOAuth2;
      };
    };
  }
}

export {};
