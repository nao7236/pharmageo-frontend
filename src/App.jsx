import React, { useState } from 'react';

const rawApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_URL = rawApiUrl.trim().replace(/\/+$/, '');

async function parseResponseJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 140);
    throw new Error(
      `Réponse non-JSON (HTTP ${res.status}) : ${preview || 'réponse vide'}`
    );
  }
}

function App() {
  const [pharmacies, setPharmacies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [selectedPharmacy, setSelectedPharmacy] = useState(null);
  const [stocks, setStocks] = useState([]);
  const [loadingStocks, setLoadingStocks] = useState(false);
  const [quantities, setQuantities] = useState({});
  const [orderSuccess, setOrderSuccess] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Modale choix de paiement : "À la caisse" ou "Directement (MTN / Moov)"
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingArticles, setPendingArticles] = useState([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [paymentMode, setPaymentMode] = useState('caisse'); // 'caisse' | 'momo'
  const [momoOperator, setMomoOperator] = useState('mtn'); // 'mtn' | 'moov'
  const [momoPhone, setMomoPhone] = useState('');
  const [txConfirmation, setTxConfirmation] = useState(null);

  const fetchPharmacies = (lat, lng) => {
    setErrorMsg('');
    fetch(`${API_URL}/api/pharmacies/search?lat=${lat}&lng=${lng}`)
      .then(async (res) => {
        const data = await parseResponseJson(res);
        if (!res.ok) {
          throw new Error(data.message || data.error || `Erreur HTTP ${res.status}`);
        }
        return data;
      })
      .then((data) => {
        setPharmacies(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error(err);
        setErrorMsg(`Impossible de joindre l'API backend (${API_URL}) : ${err.message}`);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const findPharmacies = () => {
    setLoading(true);
    setErrorMsg('');
    setSelectedPharmacy(null);
    setOrderSuccess('');

    if (!navigator.geolocation) {
      fetchPharmacies(6.3654, 2.4183);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => fetchPharmacies(pos.coords.latitude, pos.coords.longitude),
      () => fetchPharmacies(6.3654, 2.4183)
    );
  };

  const handleSelectPharmacy = async (pharmacy) => {
    setSelectedPharmacy(pharmacy);
    setLoadingStocks(true);
    setOrderSuccess('');
    setErrorMsg('');
    setQuantities({});

    try {
      const res = await fetch(`${API_URL}/api/pharmacies/${pharmacy.id}/stocks`);
      const data = await parseResponseJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors du chargement du stock');
      }
      setStocks(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message);
      setStocks([]);
    } finally {
      setLoadingStocks(false);
    }
  };

  const handleQuantityChange = (medicamentId, value, maxStock) => {
    const qty = Math.max(0, Math.min(Number(value) || 0, maxStock));
    setQuantities((prev) => ({
      ...prev,
      [medicamentId]: qty,
    }));
  };

  const getSelectedArticles = () => {
    return Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([medicament_id, quantite]) => ({
        medicament_id: Number(medicament_id),
        quantite,
      }));
  };

  const calculateTotalAmount = (articles) => {
    const total = articles.reduce((sum, item) => {
      const stockItem = stocks.find(
        (s) => (s.medicament_id ?? s.id) === item.medicament_id
      );
      const unitPrice =
        Number(stockItem?.prix_indicatif) > 0
          ? Number(stockItem.prix_indicatif)
          : 1000;
      return sum + unitPrice * item.quantite;
    }, 0);

    return Math.max(100, Math.round(total));
  };

  const savePrecommande = async (articles, paymentInfo) => {
    setSubmittingOrder(true);
    setErrorMsg('');

    try {
      const res = await fetch(`${API_URL}/api/precommandes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patient_id: 1,
          pharmacie_id: selectedPharmacy.id,
          articles,
          paiement: paymentInfo,
        }),
      });
      const data = await parseResponseJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de la précommande');
      }

      const modeLabel =
        paymentInfo.mode === 'caisse'
          ? 'Paiement à la caisse'
          : `Paiement ${paymentInfo.operator?.toUpperCase()} (${paymentInfo.phone})`;

      const successText = `${modeLabel} — Commande #${data.precommande_id} enregistrée ! Code de retrait : ${data.code_retrait}`;
      setOrderSuccess(successText);
      setQuantities({});

      setTxConfirmation({
        ok: true,
        title:
          paymentInfo.mode === 'caisse'
            ? 'Commande enregistrée (paiement à la caisse)'
            : 'Transaction effectuée avec succès !',
        modeLabel,
        amount: paymentInfo.amount,
        transactionId: paymentInfo.transactionId || 'CAISSE',
        orderId: data.precommande_id,
        codeRetrait: data.code_retrait,
      });
    } catch (err) {
      console.error('Erreur savePrecommande :', err);
      setErrorMsg(err.message);
      setTxConfirmation({
        ok: false,
        title: 'Transaction non effectuée',
        detail: err.message,
      });
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleSubmitOrder = (e) => {
    e.preventDefault();
    if (!selectedPharmacy) return;

    const articles = getSelectedArticles();
    if (articles.length === 0) {
      setErrorMsg('Choisissez au moins une quantité supérieure à 0 avant de commander.');
      return;
    }

    setErrorMsg('');
    setOrderSuccess('');
    setTxConfirmation(null);
    setPendingArticles(articles);
    setPendingTotal(calculateTotalAmount(articles));
    setPaymentMode('caisse');
    setShowPaymentModal(true);
  };

  const handleConfirmPaymentChoice = (e) => {
    e.preventDefault();
    setTxConfirmation(null);

    if (paymentMode === 'caisse') {
      savePrecommande(pendingArticles, {
        mode: 'caisse',
        provider: 'caisse_pharmacie',
        amount: pendingTotal,
        status: 'pending_cash',
      });
      return;
    }

    const cleanPhone = momoPhone.replace(/\s+/g, '');
    if (!cleanPhone || cleanPhone.length < 8) {
      const msg = 'Veuillez saisir un numéro Mobile Money valide (MTN ou Moov).';
      setErrorMsg(msg);
      setTxConfirmation({
        ok: false,
        title: 'Transaction non effectuée',
        detail: msg,
      });
      return;
    }

    savePrecommande(pendingArticles, {
      mode: 'momo',
      operator: momoOperator,
      phone: cleanPhone,
      provider: 'fedapay_sandbox_test',
      transactionId: 'MOMO-' + Date.now(),
      amount: pendingTotal,
      status: 'approved',
    });
  };

  const currentArticles = getSelectedArticles();
  const estimatedTotal = currentArticles.length > 0 ? calculateTotalAmount(currentArticles) : 0;

  return (
    <div className="min-h-screen p-8 bg-gray-50">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-blue-600">PharmaGeo</h1>
        <p className="text-gray-600">Recherchez les pharmacies autour de vous et précommandez</p>
      </header>

      <button
        onClick={findPharmacies}
        disabled={loading}
        className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
      >
        {loading ? 'Recherche...' : 'Trouver des pharmacies'}
      </button>

      {errorMsg && (
        <div className="mt-4 p-4 rounded-lg bg-red-100 text-red-700 border border-red-300">
          {errorMsg}
        </div>
      )}

      {orderSuccess && (
        <div className="mt-4 p-4 rounded-lg bg-green-100 text-green-800 border border-green-300 font-medium">
          {orderSuccess}
        </div>
      )}

      {!loading && !errorMsg && pharmacies.length === 0 && (
        <p className="mt-6 text-gray-500">Aucune pharmacie affichée pour le moment.</p>
      )}

      <div className="mt-8 grid gap-4">
        {pharmacies.map((p) => {
          const isSelected = selectedPharmacy?.id === p.id;
          return (
            <div
              key={p.id}
              onClick={() => handleSelectPharmacy(p)}
              className={`p-6 rounded-xl shadow-sm border cursor-pointer transition ${
                isSelected
                  ? 'bg-blue-50 border-blue-500'
                  : 'bg-white border-gray-100 hover:border-blue-300'
              }`}
            >
              <h2 className="text-xl font-semibold">{p.nom}</h2>
              <p className="text-gray-500">{p.adresse}</p>
              {p.distance !== undefined && p.distance !== null && (
                <p className="text-sm font-medium text-blue-500 mt-2">
                  Distance : {Number(p.distance).toFixed(2)} km
                </p>
              )}
              <p className="text-xs text-blue-600 mt-2 font-medium">
                {isSelected
                  ? 'Pharmacie sélectionnée'
                  : 'Cliquer pour voir les médicaments et commander'}
              </p>
            </div>
          );
        })}
      </div>

      {selectedPharmacy && (
        <section className="mt-8 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            Commander à : {selectedPharmacy.nom}
          </h2>

          {loadingStocks ? (
            <p className="text-gray-500">Chargement des médicaments...</p>
          ) : stocks.length === 0 ? (
            <p className="text-gray-500">Aucun médicament en stock pour cette pharmacie.</p>
          ) : (
            <form onSubmit={handleSubmitOrder}>
              <table className="w-full text-left border-collapse mb-6">
                <thead>
                  <tr className="border-b">
                    <th className="py-2">Médicament</th>
                    <th className="py-2">Prix indicatif</th>
                    <th className="py-2">Disponible</th>
                    <th className="py-2">Quantité à commander</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((s) => {
                    const medId = s.medicament_id ?? s.id;
                    return (
                      <tr key={s.id} className="border-b">
                        <td className="py-3 font-medium">{s.nom_commercial}</td>
                        <td className="py-3">
                          {s.prix_indicatif
                            ? `${Number(s.prix_indicatif).toLocaleString()} FCFA`
                            : '-'}
                        </td>
                        <td className="py-3">{s.quantite_disponible}</td>
                        <td className="py-3">
                          <input
                            type="number"
                            min="0"
                            max={s.quantite_disponible}
                            value={quantities[medId] || ''}
                            onChange={(e) =>
                              handleQuantityChange(medId, e.target.value, s.quantite_disponible)
                            }
                            className="w-24 border rounded px-2 py-1"
                            placeholder="0"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-gray-700 font-medium">
                  Montant estimé :{' '}
                  <span className="text-base font-bold text-gray-900">
                    {estimatedTotal.toLocaleString()} FCFA
                  </span>
                </p>

                <button
                  type="submit"
                  disabled={submittingOrder}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                >
                  {submittingOrder ? 'Enregistrement...' : 'Valider la précommande'}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-gray-800">
                Choisir le mode de paiement ({pendingTotal.toLocaleString()} FCFA)
              </h3>
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                className="text-gray-500 hover:text-gray-800"
              >
                ✕
              </button>
            </div>

            {txConfirmation ? (
              <div className="space-y-4">
                {txConfirmation.ok ? (
                  <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900 space-y-1.5">
                    <p className="font-bold text-base">{txConfirmation.title}</p>
                    <p>Mode : <strong>{txConfirmation.modeLabel}</strong></p>
                    <p>Montant : <strong>{Number(txConfirmation.amount).toLocaleString()} FCFA</strong></p>
                    <p>Commande : <strong>#{txConfirmation.orderId}</strong></p>
                    <p>Référence : <span className="font-mono">{txConfirmation.transactionId}</span></p>
                    <p className="pt-1 text-base">
                      Code de retrait : <strong className="font-mono text-green-800">{txConfirmation.codeRetrait}</strong>
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 space-y-1">
                    <p className="font-bold text-base">{txConfirmation.title}</p>
                    <p>{txConfirmation.detail}</p>
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  {!txConfirmation.ok && (
                    <button
                      type="button"
                      onClick={() => setTxConfirmation(null)}
                      className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    >
                      Réessayer
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleConfirmPaymentChoice} className="space-y-4">
                <div className="space-y-2">
                  <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="paymentMode"
                      value="caisse"
                      checked={paymentMode === 'caisse'}
                      onChange={() => setPaymentMode('caisse')}
                    />
                    <div>
                      <p className="font-semibold text-gray-800">Payer à la caisse</p>
                      <p className="text-xs text-gray-500">
                        Réserve la commande et génère un code de retrait à donner à la pharmacie.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="paymentMode"
                      value="momo"
                      checked={paymentMode === 'momo'}
                      onChange={() => setPaymentMode('momo')}
                    />
                    <div>
                      <p className="font-semibold text-gray-800">Payer directement (Mobile Money)</p>
                      <p className="text-xs text-gray-500">
                        Renseignez votre réseau MTN ou Moov et votre numéro.
                      </p>
                    </div>
                  </label>
                </div>

                {paymentMode === 'momo' && (
                  <div className="space-y-3 rounded-lg bg-blue-50/60 p-3 border border-blue-100">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Réseau Mobile Money
                      </label>
                      <select
                        value={momoOperator}
                        onChange={(e) => setMomoOperator(e.target.value)}
                        className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                      >
                        <option value="mtn">MTN Mobile Money</option>
                        <option value="moov">Moov Money</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Numéro de téléphone
                      </label>
                      <input
                        type="tel"
                        required
                        placeholder="Ex : 01 97 00 00 00"
                        value={momoPhone}
                        onChange={(e) => setMomoPhone(e.target.value)}
                        className="w-full rounded-lg border bg-white px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPaymentModal(false)}
                    className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={submittingOrder}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {submittingOrder
                      ? 'Validation...'
                      : paymentMode === 'caisse'
                      ? 'Obtenir le code de retrait'
                      : 'Payer et valider'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;