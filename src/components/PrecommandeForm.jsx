// Frontend: Composant Précommande (Formulaire)
import React, { useState } from 'react';

const PrecommandeForm = ({ pharmacieId, patientId, medicaments }) => {
    const [file, setFile] = useState(null);
    const [cart, setCart] = useState([]); // Array de {medicament_id, quantite}

    const handleSubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData();
        formData.append('patient_id', patientId);
        formData.append('pharmacie_id', pharmacieId);
        formData.append('ordonnance', file);
        formData.append('items', JSON.stringify(cart));

        await fetch('http://localhost:5000/api/precommandes', {
            method: 'POST',
            body: formData
        });
        alert('Précommande soumise !');
    };

    return (
        <form onSubmit={handleSubmit} className="p-6 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">Nouvelle Précommande</h2>
            <input type="file" onChange={(e) => setFile(e.target.files[0])} className="mb-4" />
            {/* Logic pour ajouter des médicaments au panier cart ici */}
            <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded">Valider</button>
        </form>
    );
};
export default PrecommandeForm;
