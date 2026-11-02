import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  return redirect(`/app/createNewPostPurchaseOffer${url.search}`);
};

export default function RedirectCreateNewPostPurchaseOffer() {
  return null;
}
