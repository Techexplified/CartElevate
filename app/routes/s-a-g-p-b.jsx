import { redirect } from "react-router";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  return redirect(`/app/s-a-g-p-b${url.search}`);
};

export default function RedirectSagpb() {
  return null;
}
