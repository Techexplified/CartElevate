import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  return redirect(`/app/newRecomendation${url.search}`);
};

export default function RedirectRootNewRecomendation() {
  return null;
}
