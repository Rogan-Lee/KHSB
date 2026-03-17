interface Window {
  Kakao: {
    init: (key: string) => void;
    isInitialized: () => boolean;
    Share: {
      sendDefault: (settings: {
        objectType: string;
        text?: string;
        link: { mobileWebUrl: string; webUrl: string };
        buttonTitle?: string;
      }) => void;
    };
  };
}
