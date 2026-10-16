import { Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import CreatePage from "./pages/CreatePage";
import CreateCollectionPage from "./pages/CreateCollectionPage";
import PublicProductPage from "./pages/PublicProductPage";
import ProductPaymentSuccessPage from "./pages/ProductPaymentSuccessPage";
import ProductPageInsightsPage from "./pages/ProductPageInsightsPage";
import EditProductPage from "./pages/EditProductPage";
import AdminPage from "./pages/AdminPage";
import RecoverEditLinkPage from "./pages/RecoverEditLinkPage";
import TermsOfServicePage from "./pages/TermsOfServicePage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/create" element={<CreatePage />} />
      <Route path="/create/collection" element={<CreateCollectionPage />} />
      <Route path="/p/:slug" element={<PublicProductPage />} />
      <Route path="/edit/:token" element={<EditProductPage />} />
      <Route
        path="/payment/success"
        element={<ProductPaymentSuccessPage />}
      />
      <Route path="/insights/:token" element={<ProductPageInsightsPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/terms" element={<TermsOfServicePage />} />
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/recover-edit-link" element={<RecoverEditLinkPage />} />
    </Routes>
  );
}

export default App;
