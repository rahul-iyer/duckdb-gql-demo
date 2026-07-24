type AnalyticsEventData = Record<string, string | number | boolean>;

type UmamiTracker = {
  track: (eventName: string, eventData?: AnalyticsEventData) => void;
};

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

const websiteId = import.meta.env.VITE_UMAMI_WEBSITE_ID?.trim();
const scriptUrl =
  import.meta.env.VITE_UMAMI_SCRIPT_URL?.trim() ||
  "https://cloud.umami.is/script.js";
const pendingEvents: Array<{
  name: string;
  data?: AnalyticsEventData;
}> = [];

function flushPendingEvents(): void {
  if (!window.umami) {
    return;
  }
  for (const event of pendingEvents.splice(0)) {
    window.umami.track(event.name, event.data);
  }
}

export function initializeAnalytics(): void {
  if (!websiteId) {
    return;
  }

  const script = document.createElement("script");
  script.defer = true;
  script.src = scriptUrl;
  script.dataset.websiteId = websiteId;
  script.dataset.domains = window.location.hostname;
  script.addEventListener("load", flushPendingEvents);
  document.head.append(script);
}

export function trackEvent(
  eventName: string,
  eventData?: AnalyticsEventData
): void {
  if (!websiteId) {
    return;
  }
  if (window.umami) {
    window.umami.track(eventName, eventData);
    return;
  }
  pendingEvents.push({ name: eventName, data: eventData });
}
