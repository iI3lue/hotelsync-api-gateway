export const SERVICE_ROUTES = [
  { prefix: "/property", urlKey: "PROPERTY_SERVICE_URL" },
  { prefix: "/rate", urlKey: "RATE_AVAILABILITY_SERVICE_URL" },
  { prefix: "/users", urlKey: "USER_SERVICE_URL" },
  { prefix: "/booking", urlKey: "BOOKING_SERVICE_URL" },
  { prefix: "/front-desk", urlKey: "FRONT_DESK_SERVICE_URL" },
  { prefix: "/housekeeping", urlKey: "HOUSEKEEPING_SERVICE_URL" },
  { prefix: "/billing", urlKey: "BILLING_SERVICE_URL" },
  { prefix: "/loyalty", urlKey: "LOYALTY_SERVICE_URL" },
  { prefix: "/payments", urlKey: "PAYMENTS_SERVICE_URL" },
  { prefix: "/analytics", urlKey: "ANALYTICS_SERVICE_URL" },
  { prefix: "/channel-manager", urlKey: "CHANNEL_MANAGER_SERVICE_URL" },
] as const;

export type ServiceRoute = (typeof SERVICE_ROUTES)[number];
export type ServiceUrlKey = ServiceRoute["urlKey"];
