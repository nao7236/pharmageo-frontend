import React, { useState, useEffect } from 'react';

// Composant Carte (simulé pour l'intégration)
const MapView = ({ pharmacies }) => {
    return (
        <div className="h-64 bg-gray-200 rounded-xl flex items-center justify-center">
            <p className="text-gray-500">Intégration Google Maps ici (utiliser @react-google-maps/api)</p>
            {/* Ici, on mapperait les pharmacies avec GoogleMap / Marker */}
        </div>
    );
};

// Composant Stock pour le pharmacien
const StockManager = ({ pharmacieId }) => {
    const [stocks, setStocks] = useState([]);

    useEffect(() => {
        fetch(`http://localhost:5000/api/pharmacies/${pharmacieId}/stocks`)
            .then(res => res.json())
            .then(data => setStocks(data));
    }, [pharmacieId]);

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm mt-8">
            <h2 className="text-xl font-bold mb-4">Gestion des Stocks</h2>
            <table className="w-full text-left">
                <thead>
                    <tr>
                        <th className="pb-2">Médicament</th>
                        <th className="pb-2">Quantité</th>
                        <th className="pb-2">Action</th>
                    </tr>
                </thead>
                <tbody>
                    {stocks.map(s => (
                        <tr key={s.id} className="border-t">
                            <td className="py-2">{s.nom_commercial}</td>
                            <td className="py-2">{s.quantite_disponible}</td>
                            <td className="py-2">
                                <button className="text-blue-600 hover:underline">Modifier</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
