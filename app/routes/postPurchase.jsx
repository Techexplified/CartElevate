import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  return redirect(`/app/postPurchase${url.search}`);
};

export default function RedirectPostPurchase() {
  return null;
}
