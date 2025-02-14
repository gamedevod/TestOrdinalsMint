// src/App.js
import React, { useState } from 'react';
import { request, RpcErrorCode, AddressPurpose } from '@sats-connect/core';
import { Buffer } from 'buffer';
import * as bitcoin from 'bitcoinjs-lib';

function App() {
    // ----------------- Wallet States -----------------
    const [okxConnected, setOkxConnected] = useState(false);
    const [okxAddress, setOkxAddress] = useState('');
    const [okxPublicKey, setOkxPublicKey] = useState('');

    const [xverseConnected, setXverseConnected] = useState(false);
    const [xverseAddresses, setXverseAddresses] = useState([]);

    const [uniSatConnected, setUniSatConnected] = useState(false);
    const [uniSatAddress, setUniSatAddress] = useState('');
    const [uniSatPublicKey, setUniSatPublicKey] = useState('');
    const [inscriptionID, setInscriptionID] = useState('');

    // ----------------- Minting States -----------------
    const [collectionID, setCollectionID] = useState('');
    const [feeRate, setFeeRate] = useState('');
    const [transactionId, setTransactionId] = useState('');
    const [status, setStatus] = useState('');

    // ----------------- Create Collection States -----------------
    const [createName, setCreateName] = useState('');
    const [createDescription, setCreateDescription] = useState('');
    const [createTotalSupply, setCreateTotalSupply] = useState('');
    const [createCoverImage, setCreateCoverImage] = useState('');
    const [createCreator, setCreateCreator] = useState('');
    const [createWalletAddress, setCreateWalletAddress] = useState('');
    const [createOrdinals, setCreateOrdinals] = useState('');
    const [phases, setPhases] = useState([]);

    // ----------------- View/Edit Collection States -----------------
    const [viewCollectionID, setViewCollectionID] = useState('');
    // viewCollection хранит всю информацию, включая launchpad.phases
    const [viewCollection, setViewCollection] = useState(null);
    // Для редактирования отдельной фазы
    const [editPhaseData, setEditPhaseData] = useState(null);
    const [editPhaseCollectionID, setEditPhaseCollectionID] = useState('');
    // Для добавления адресной аллокации к фазе
    const [allocationPhaseId, setAllocationPhaseId] = useState('');
    const [allocationAddress, setAllocationAddress] = useState('');
    const [allocationMaxMintCount, setAllocationMaxMintCount] = useState('');

    // ----------------- Collection Info Edit States -----------------
    const [editCollectionInfo, setEditCollectionInfo] = useState({});

    // ----------------- Process Inscriptions State -----------------
    const [processCollectionID, setProcessCollectionID] = useState('');

    // ----------------- Active Tab -----------------
    const [activeTab, setActiveTab] = useState('minting');

    const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

    // ----------------- Styles -----------------
    const buttonStyle = {
        padding: '10px 20px',
        backgroundColor: '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '16px',
        marginRight: '10px'
    };

    const tabButtonStyle = (tab) => ({
        ...buttonStyle,
        backgroundColor: activeTab === tab ? '#2E7D32' : '#4CAF50'
    });

    // ----------------- Wallet Functions -----------------
    const connectXverse = async () => {
        try {
            const params = {
                purposes: ['payment', 'ordinals'],
                message: 'Please connect your wallet to sign the PSBT.'
            };
            const response = await request('getAccounts', params);
            if (response.status === 'success') {
                setXverseAddresses(response.result);
                setXverseConnected(true);
                setStatus('Xverse wallet connected.');
            } else {
                if (response.error.code === RpcErrorCode.USER_REJECTION) {
                    alert("User rejected the request to connect the Xverse wallet.");
                } else {
                    alert("Error connecting Xverse wallet: " + response.error.message);
                }
            }
        } catch (err) {
            alert("Error connecting Xverse wallet: " + err.message);
        }
    };

    const connectUniSat = async () => {
        try {
            if (typeof window.unisat === 'undefined') {
                alert('UniSat Wallet not found. Please install the UniSat extension.');
                return;
            }
            setStatus('Connecting to UniSat Wallet...');
            const accounts = await window.unisat.requestAccounts();
            if (accounts && accounts.length > 0) {
                setUniSatAddress(accounts[0]);
                setUniSatConnected(true);
                setStatus(`UniSat Wallet connected: ${accounts[0]}`);
                try {
                    if (typeof window.unisat.getPublicKey === 'function') {
                        const publicKey = await window.unisat.getPublicKey();
                        setUniSatPublicKey(publicKey);
                    } else {
                        setUniSatPublicKey('placeholder_public_key');
                    }
                } catch (pkError) {
                    setStatus(`Error retrieving UniSat public key: ${pkError.message}`);
                }
            } else {
                setStatus('Failed to retrieve UniSat wallet address.');
            }
        } catch (error) {
            setStatus(`Error connecting UniSat Wallet: ${error.message}`);
        }
    };

    const connectOKX = async () => {
        try {
            if (typeof window.okxwallet === 'undefined' || typeof window.okxwallet.bitcoinSignet === 'undefined') {
                alert('OKX Wallet (Signet) not found. Please install the OKX Wallet extension.');
                return;
            }
            setStatus('Connecting to OKX Wallet...');
            const result = await window.okxwallet.bitcoinSignet.connect();
            if (result.address && result.publicKey) {
                setOkxAddress(result.address);
                setOkxPublicKey(result.publicKey);
                setOkxConnected(true);
                setStatus(`OKX Wallet connected: ${result.address}`);
            } else {
                throw new Error('Failed to retrieve address or public key from OKX Wallet.');
            }
        } catch (error) {
            setStatus(`Error connecting OKX Wallet: ${error.message}`);
        }
    };

    // ----------------- Minting Function -----------------
    const getAndSignPsbt = async (walletType) => {
        let buyerAddress, buyerPublicKey, signPsbtFunction;
        let buyerReceiverAddress = '';

        if (!collectionID.trim()) {
            alert("Please enter a Collection ID.");
            return;
        }
        const feeRateNumber = parseInt(feeRate, 10);
        if (isNaN(feeRateNumber) || feeRateNumber <= 0) {
            alert("Please enter a valid Fee Rate.");
            return;
        }
        switch (walletType) {
            case 'OKX':
                if (!okxConnected) { alert("Please connect the OKX Wallet first."); return; }
                buyerAddress = okxAddress;
                buyerPublicKey = okxPublicKey;
                signPsbtFunction = window.okxwallet.bitcoinSignet.signPsbt;
                buyerReceiverAddress = buyerAddress;
                break;
            case 'Xverse':
                if (!xverseConnected) { alert("Please connect the Xverse wallet first."); return; }
                buyerAddress = xverseAddresses.find((addr) => addr.purpose === AddressPurpose.Payment)?.address || '';
                buyerPublicKey = xverseAddresses.find((addr) => addr.purpose === AddressPurpose.Payment)?.publicKey || '';
                buyerReceiverAddress = xverseAddresses.find((addr) => addr.purpose === AddressPurpose.Ordinals)?.address || buyerAddress;
                signPsbtFunction = async (psbtBase64, options) => {
                    try {
                        const signedPsbt = await request('signPsbt', { psbt: psbtBase64, ...options });
                        return signedPsbt;
                    } catch (error) {
                        throw new Error(`Xverse signing failed: ${error.message}`);
                    }
                };
                break;
            case 'UniSat':
                if (!uniSatConnected) { alert("Please connect the UniSat Wallet first."); return; }
                buyerAddress = uniSatAddress;
                buyerPublicKey = uniSatPublicKey;
                signPsbtFunction = window.unisat.signPsbt;
                buyerReceiverAddress = buyerAddress;
                break;
            default:
                alert("Unsupported wallet type.");
                return;
        }
        try {
            setStatus(`Initiating Minting via ${walletType}...`);
            const initiateResponse = await fetch(`${API_BASE_URL}/mint/init`, {
                method: 'POST',
                headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    buyerPaymentAddress: buyerAddress,
                    buyerPaymentPublicKey: buyerPublicKey,
                    buyerReceiverAddress: buyerReceiverAddress,
                    collectionId: collectionID,
                    feeRate: feeRateNumber,
                }),
            });
            if (!initiateResponse.ok) {
                let errorMsg = `Error initiating Minting: ${initiateResponse.status} ${initiateResponse.statusText}`;
                try { const errorData = await initiateResponse.json(); errorMsg += ` - ${errorData.message}`; } catch (e) {}
                throw new Error(errorMsg);
            }
            const initiateData = await initiateResponse.json();
            const psbtHex = initiateData.psbtHex;
            const buyerInputIndices = initiateData.buyerInputIndices;
            const receivedInscriptionID = initiateData.inscriptionID;
            const receivedTransactionID = initiateData.transactionId;
            if (!psbtHex) throw new Error('PSBT not received from the server.');
            setInscriptionID(receivedInscriptionID);
            setTransactionId(receivedTransactionID);
            setStatus(`Signing PSBT via ${walletType}...`);
            const toSignInputs = buyerInputIndices.map((index) => ({ index, address: buyerAddress }));
            if (toSignInputs.some((input) => input.index === 0))
                throw new Error("Invalid input index 0 found in buyerInputIndices.");
            let signedPsbtResponse;
            if (walletType === 'Xverse') {
                const psbtBuffer = Buffer.from(psbtHex, 'hex');
                const psbtBase64 = psbtBuffer.toString('base64');
                const signInputs = toSignInputs.reduce((acc, { address, index }) => {
                    if (!acc[address]) acc[address] = [];
                    acc[address].push(index);
                    return acc;
                }, {});
                signedPsbtResponse = await signPsbtFunction(psbtBase64, { signInputs, broadcast: false });
            } else {
                signedPsbtResponse = await signPsbtFunction(psbtHex, { autoFinalized: false, toSignInputs: buyerInputIndices.map((index) => ({ index, address: buyerAddress })) });
            }
            if (walletType === 'Xverse') {
                if (signedPsbtResponse.status !== "success") {
                    if (signedPsbtResponse.error.code === RpcErrorCode.USER_REJECTION)
                        throw new Error("User rejected the signing request.");
                    else throw new Error(`Signing failed: ${signedPsbtResponse.error.message}`);
                }
                const signedPsbtBase64 = signedPsbtResponse.psbt;
                const txid = signedPsbtResponse.txid;
                if (!txid) {
                    const signedPsbtBuffer = Buffer.from(signedPsbtBase64, 'base64');
                    const signedPsbtHex = signedPsbtBuffer.toString('hex');
                    setStatus(`Completing Minting via ${walletType}...`);
                    const completeResponse = await fetch(`${API_BASE_URL}/mint/complete`, {
                        method: 'POST',
                        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                        body: JSON.stringify({ transactionId: receivedTransactionID, psbtHex: signedPsbtHex }),
                    });
                    if (!completeResponse.ok) {
                        let errorMsg = `Error completing Minting: ${completeResponse.status} ${completeResponse.statusText}`;
                        try { const errorData = await completeResponse.json(); errorMsg += ` - ${errorData.message}`; } catch (e) {}
                        throw new Error(errorMsg);
                    }
                    const completeData = await completeResponse.json();
                    setStatus(`Minting successfully completed via ${walletType}. TXID: ${completeData.transactionID}`);
                } else {
                    setStatus(`Minting successfully completed via ${walletType}. TXID: ${txid}`);
                }
            } else {
                if (!signedPsbtResponse) throw new Error(`Failed to sign PSBT via ${walletType}.`);
                setStatus(`Completing Minting via ${walletType}...`);
                const completeResponse = await fetch(`${API_BASE_URL}/mint/complete`, {
                    method: 'POST',
                    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ transactionId: receivedTransactionID, psbtHex: signedPsbtResponse }),
                });
                if (!completeResponse.ok) {
                    let errorMsg = `Error completing Minting: ${completeResponse.status} ${completeResponse.statusText}`;
                    try { const errorData = await completeResponse.json(); errorMsg += ` - ${errorData.message}`; } catch (e) {}
                    throw new Error(errorMsg);
                }
                const completeData = await completeResponse.json();
                setStatus(`Minting successfully completed via ${walletType}. TXID: ${completeData.transactionID}`);
            }
            setInscriptionID('');
            setTransactionId('');
        } catch (error) {
            setStatus(`Mint Error (${walletType}): ${error.message}`);
        }
    };

    // ----------------- Collection Management Functions -----------------
    // Add Phase (for creating a collection)
    const addPhase = () => {
        setPhases([...phases, {
            displayName: '',
            startTime: '',
            endTime: '',
            maxMintPerAddress: '',
            price: '',
            isPublic: false,
            addressAllocations: '',
        }]);
    };

    // Update field of a phase (for creating a collection)
    const handlePhaseChange = (index, field, value) => {
        const updatedPhases = [...phases];
        updatedPhases[index][field] = value;
        setPhases(updatedPhases);
    };

    // Create Collection
    const handleCreateCollection = async () => {
        const ordinalsArray = createOrdinals.split(',').map((s) => s.trim());
        const phasesPayload = phases.map((phase) => {
            let parsedAllocations = [];
            if (!phase.isPublic && phase.addressAllocations.trim() !== '') {
                try { parsedAllocations = JSON.parse(phase.addressAllocations); }
                catch (err) { alert(`Ошибка парсинга адресных аллокаций для фазы "${phase.displayName}".`); throw err; }
            }
            return {
                displayName: phase.displayName,
                startTime: Number(phase.startTime),
                endTime: Number(phase.endTime),
                maxMintPerAddress: Number(phase.maxMintPerAddress),
                price: Number(phase.price),
                isPublic: phase.isPublic,
                addressAllocations: parsedAllocations,
            };
        });
        const payload = {
            name: createName,
            description: createDescription,
            totalSupply: Number(createTotalSupply),
            coverImage: createCoverImage,
            creator: createCreator,
            walletAddress: createWalletAddress,
            ordinals: ordinalsArray,
            phases: phasesPayload,
        };
        try {
            setStatus("Создание коллекции...");
            const response = await fetch(`${API_BASE_URL}/collections/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Ошибка создания коллекции.");
            }
            setStatus("Коллекция успешно создана.");
            setCreateName(''); setCreateDescription('');
            setCreateTotalSupply(''); setCreateCoverImage('');
            setCreateCreator(''); setCreateWalletAddress('');
            setCreateOrdinals(''); setPhases([]);
        } catch (error) {
            setStatus(`Ошибка создания коллекции: ${error.message}`);
        }
    };

    // ----------------- View/Edit Collection Functions -----------------
    // Load full Collection Info (GET /collections/{id}/info)
    const handleLoadCollectionInfo = async () => {
        if (!viewCollectionID.trim()) {
            alert("Введите ID коллекции для загрузки информации.");
            return;
        }
        try {
            setStatus("Загрузка информации о коллекции...");
            const response = await fetch(`${API_BASE_URL}/collections/${viewCollectionID}/info`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Ошибка загрузки информации о коллекции.");
            }
            const data = await response.json();
            setViewCollection(data);
            setEditCollectionInfo({
                title: data.title,
                creator: data.creator,
                cover: data.cover,
                walletAddress: data.walletAddress,
                isPopular: data.isPopular,
                isFeatured: data.isFeatured,
                isOnBanner: data.isOnBanner,
                genre: data.genre ? data.genre.join(', ') : ''
            });
            setStatus("Информация о коллекции загружена.");
        } catch (error) {
            setStatus(`Ошибка загрузки информации о коллекции: ${error.message}`);
        }
    };

    // Delete Phase
    const handleDeletePhase = async (phaseId) => {
        if (!viewCollectionID.trim()) {
            alert("Сначала загрузите коллекцию.");
            return;
        }
        if (!window.confirm("Вы уверены, что хотите удалить эту фазу?")) return;
        try {
            setStatus("Удаление фазы...");
            const response = await fetch(`${API_BASE_URL}/collections/${viewCollectionID}/phase/${phaseId}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Ошибка удаления фазы.");
            }
            setStatus("Фаза удалена.");
            handleLoadCollectionInfo();
        } catch (error) {
            setStatus(`Ошибка удаления фазы: ${error.message}`);
        }
    };

    // Edit Phase – load phase data into edit form
    const handleEditPhase = (phase) => {
        const startTimestamp = phase.startTime ? Math.floor(new Date(phase.startTime).getTime() / 1000) : '';
        const endTimestamp = phase.endTime ? Math.floor(new Date(phase.endTime).getTime() / 1000) : '';
        setEditPhaseData({
            ...phase,
            startTime: startTimestamp,
            endTime: endTimestamp,
            addressAllocations: phase.addressAllocations ? JSON.stringify(phase.addressAllocations, null, 2) : ''
        });
        setEditPhaseCollectionID(viewCollectionID);
    };

    // Update Phase
    const handleUpdatePhase = async () => {
        if (!editPhaseData || !editPhaseData.id) {
            alert("Нет данных для обновления.");
            return;
        }
        try {
            setStatus("Обновление фазы...");
            const response = await fetch(`${API_BASE_URL}/collections/${editPhaseCollectionID}/phase/${editPhaseData.id}/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editPhaseData)
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Ошибка обновления фазы.");
            }
            setStatus("Фаза успешно обновлена.");
            setEditPhaseData(null);
            handleLoadCollectionInfo();
        } catch (error) {
            setStatus(`Ошибка обновления фазы: ${error.message}`);
        }
    };

    // Update field in edit phase form
    const handleEditPhaseChange = (field, value) => {
        setEditPhaseData({ ...editPhaseData, [field]: value });
    };

    // Add Address Allocation to Phase
    const handleUpdateAllocation = async () => {
        if (!viewCollectionID.trim() || !allocationPhaseId.trim()) {
            alert("Введите ID коллекции и фазы для обновления аллокации.");
            return;
        }
        const payload = { address: allocationAddress, maxMintCount: Number(allocationMaxMintCount) };
        try {
            setStatus("Обновление адресной аллокации...");
            const response = await fetch(`${API_BASE_URL}/collections/${viewCollectionID}/phase/${allocationPhaseId}/allocation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Ошибка обновления аллокации.");
            }
            setStatus("Аллокация успешно обновлена.");
            handleLoadCollectionInfo();
        } catch (error) {
            setStatus(`Ошибка обновления аллокации: ${error.message}`);
        }
    };

    // Update Collection Info
    const handleUpdateCollectionInfo = async () => {
        if (!viewCollectionID.trim()) {
            alert("Введите ID коллекции для обновления информации.");
            return;
        }
        try {
            setStatus("Обновление информации о коллекции...");
            const payload = {
                title: editCollectionInfo.title,
                creator: editCollectionInfo.creator,
                cover: editCollectionInfo.cover,
                walletAddress: editCollectionInfo.walletAddress,
                isPopular: editCollectionInfo.isPopular,
                isFeatured: editCollectionInfo.isFeatured,
                isOnBanner: editCollectionInfo.isOnBanner,
                genre: editCollectionInfo.genre ? editCollectionInfo.genre.split(',').map(s => s.trim()) : []
            };
            const response = await fetch(`${API_BASE_URL}/collections/${viewCollectionID}/updateInfo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Ошибка обновления информации о коллекции.");
            }
            setStatus("Информация о коллекции успешно обновлена.");
            handleLoadCollectionInfo();
        } catch (error) {
            setStatus(`Ошибка обновления информации о коллекции: ${error.message}`);
        }
    };

    // Process Inscriptions
    const handleProcessInscriptions = async () => {
        if (!processCollectionID.trim()) {
            alert("Введите ID коллекции для обработки инскрипций.");
            return;
        }
        try {
            setStatus("Запуск обработки инскрипций...");
            const response = await fetch(`${API_BASE_URL}/collections/${processCollectionID}/process-inscriptions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || "Ошибка обработки инскрипций.");
            }
            setStatus("Обработка инскрипций успешно выполнена.");
        } catch (error) {
            setStatus(`Ошибка обработки инскрипций: ${error.message}`);
        }
    };

    // ----------------- Render UI -----------------
    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
            <h1>PSBT Mint & Collection Manager</h1>
            {/* Tab Menu */}
            <div style={{ marginBottom: '20px' }}>
                <button style={tabButtonStyle('minting')} onClick={() => setActiveTab('minting')}>Minting</button>
                <button style={tabButtonStyle('create')} onClick={() => setActiveTab('create')}>Create Collection</button>
                <button style={tabButtonStyle('view')} onClick={() => setActiveTab('view')}>View/Edit Collection</button>
                <button style={tabButtonStyle('process')} onClick={() => setActiveTab('process')}>Process Inscriptions</button>
            </div>

            {/* Minting Tab */}
            {activeTab === 'minting' && (
                <div>
                    <h2>Minting (Подписание PSBT)</h2>
                    <div style={{ marginBottom: '20px' }}>
                        <label>
                            <strong>Collection ID:</strong>
                            <input type="text" value={collectionID} onChange={(e) => setCollectionID(e.target.value)} placeholder="Enter Collection ID" style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                        </label>
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                        <label>
                            <strong>Fee Rate (sats/byte):</strong>
                            <input type="number" value={feeRate} onChange={(e) => setFeeRate(e.target.value)} placeholder="Enter Fee Rate" style={{ marginLeft: '10px', padding: '5px', width: '100px' }} min="1" />
                        </label>
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                        {!okxConnected ? (
                            <button onClick={connectOKX} style={buttonStyle}>Connect OKX Wallet</button>
                        ) : (
                            <p>✅ OKX Wallet connected: {okxAddress}</p>
                        )}
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                        {!xverseConnected ? (
                            <button onClick={connectXverse} style={buttonStyle}>Connect Xverse Wallet</button>
                        ) : (
                            <p>✅ Xverse Wallet connected.</p>
                        )}
                    </div>
                    <div style={{ marginBottom: '20px' }}>
                        {!uniSatConnected ? (
                            <button onClick={connectUniSat} style={buttonStyle}>Connect UniSat Wallet</button>
                        ) : (
                            <p>✅ UniSat Wallet connected: {uniSatAddress}</p>
                        )}
                    </div>
                    <div style={{ marginTop: '20px' }}>
                        {xverseConnected && <button onClick={() => getAndSignPsbt('Xverse')} style={buttonStyle}>Minting (Xverse)</button>}
                        {uniSatConnected && <button onClick={() => getAndSignPsbt('UniSat')} style={buttonStyle}>Minting (UniSat)</button>}
                        {okxConnected && <button onClick={() => getAndSignPsbt('OKX')} style={buttonStyle}>Minting (OKX)</button>}
                    </div>
                    <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
                        <strong>Inscription ID:</strong> {inscriptionID || 'No inscription selected'}
                    </div>
                    <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
                        <strong>Transaction ID:</strong> {transactionId || 'No transaction initiated'}
                    </div>
                </div>
            )}

            {/* Create Collection Tab */}
            {activeTab === 'create' && (
                <div>
                    <h2>Create Collection</h2>
                    <div style={{ marginBottom: '10px' }}>
                        <label><strong>Name:</strong>
                            <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                        </label>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <label><strong>Description:</strong>
                            <textarea value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} style={{ marginLeft: '10px', padding: '5px', width: '300px', height: '60px' }} />
                        </label>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <label><strong>Total Supply:</strong>
                            <input type="number" value={createTotalSupply} onChange={(e) => setCreateTotalSupply(e.target.value)} style={{ marginLeft: '10px', padding: '5px', width: '150px' }} />
                        </label>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <label><strong>Cover Image URL:</strong>
                            <input type="text" value={createCoverImage} onChange={(e) => setCreateCoverImage(e.target.value)} style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                        </label>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <label><strong>Creator:</strong>
                            <input type="text" value={createCreator} onChange={(e) => setCreateCreator(e.target.value)} style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                        </label>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <label><strong>Wallet Address:</strong>
                            <input type="text" value={createWalletAddress} onChange={(e) => setCreateWalletAddress(e.target.value)} style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                        </label>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <label><strong>Ordinals (comma-separated):</strong>
                            <input type="text" value={createOrdinals} onChange={(e) => setCreateOrdinals(e.target.value)} style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                        </label>
                    </div>
                    {/* Dynamic Phases */}
                    <div style={{ marginTop: '20px' }}>
                        <h3>Phases</h3>
                        {phases.map((phase, index) => (
                            <div key={index} style={{ marginBottom: '15px', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
                                <h4>Phase {index + 1}</h4>
                                <div style={{ marginBottom: '8px' }}>
                                    <label>
                                        Display Name:
                                        <input type="text" value={phase.displayName} onChange={(e) => handlePhaseChange(index, 'displayName', e.target.value)} style={{ marginLeft: '10px', padding: '5px', width: '250px' }} />
                                    </label>
                                </div>
                                <div style={{ marginBottom: '8px' }}>
                                    <label>
                                        Start Time (Unix Timestamp):
                                        <input type="number" value={phase.startTime} onChange={(e) => handlePhaseChange(index, 'startTime', e.target.value)} style={{ marginLeft: '10px', padding: '5px', width: '150px' }} />
                                    </label>
                                </div>
                                <div style={{ marginBottom: '8px' }}>
                                    <label>
                                        End Time (Unix Timestamp):
                                        <input type="number" value={phase.endTime} onChange={(e) => handlePhaseChange(index, 'endTime', e.target.value)} style={{ marginLeft: '10px', padding: '5px', width: '150px' }} />
                                    </label>
                                </div>
                                <div style={{ marginBottom: '8px' }}>
                                    <label>
                                        Max Mint Per Address:
                                        <input type="number" value={phase.maxMintPerAddress} onChange={(e) => handlePhaseChange(index, 'maxMintPerAddress', e.target.value)} style={{ marginLeft: '10px', padding: '5px', width: '100px' }} />
                                    </label>
                                </div>
                                <div style={{ marginBottom: '8px' }}>
                                    <label>
                                        Price (in satoshi):
                                        <input type="number" value={phase.price} onChange={(e) => handlePhaseChange(index, 'price', e.target.value)} style={{ marginLeft: '10px', padding: '5px', width: '100px' }} />
                                    </label>
                                </div>
                                <div style={{ marginBottom: '8px' }}>
                                    <label>
                                        Is Public:
                                        <input type="checkbox" checked={phase.isPublic} onChange={(e) => handlePhaseChange(index, 'isPublic', e.target.checked)} style={{ marginLeft: '10px' }} />
                                    </label>
                                </div>
                                {!phase.isPublic && (
                                    <div style={{ marginBottom: '8px' }}>
                                        <label>
                                            Address Allocations (JSON):
                                            <textarea value={phase.addressAllocations} onChange={(e) => handlePhaseChange(index, 'addressAllocations', e.target.value)} placeholder='e.g. [{"address": "1abc...", "maxMintCount": 3}]' style={{ marginLeft: '10px', padding: '5px', width: '300px', height: '60px' }} />
                                        </label>
                                    </div>
                                )}
                            </div>
                        ))}
                        <button onClick={addPhase} style={buttonStyle}>Add Phase</button>
                    </div>
                    <div style={{ marginTop: '20px' }}>
                        <button onClick={handleCreateCollection} style={buttonStyle}>Create Collection</button>
                    </div>
                </div>
            )}

            {/* View/Edit Collection Tab */}
            {activeTab === 'view' && (
                <div>
                    <h2>View/Edit Collection</h2>
                    <div style={{ marginBottom: '10px' }}>
                        <label>
                            <strong>Collection ID:</strong>
                            <input type="text" value={viewCollectionID} onChange={(e) => setViewCollectionID(e.target.value)} placeholder="Enter Collection ID" style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                        </label>
                        <button onClick={handleLoadCollectionInfo} style={buttonStyle}>Load Collection Info</button>
                    </div>
                    {viewCollection && (
                        <div style={{ marginTop: '20px' }}>
                            <h3>Collection Info</h3>
                            <p><strong>Title:</strong> {viewCollection.title}</p>
                            <p><strong>Creator:</strong> {viewCollection.creator}</p>
                            <p><strong>Cover:</strong> {viewCollection.cover}</p>
                            <p><strong>Wallet Address:</strong> {viewCollection.walletAddress}</p>
                            <p><strong>Status:</strong> {viewCollection.status}</p>
                            <p><strong>Is Popular:</strong> {viewCollection.isPopular ? 'Yes' : 'No'}</p>
                            <p><strong>Is Featured:</strong> {viewCollection.isFeatured ? 'Yes' : 'No'}</p>
                            <p><strong>Is On Banner:</strong> {viewCollection.isOnBanner ? 'Yes' : 'No'}</p>
                            <p><strong>Genre:</strong> {viewCollection.genre ? viewCollection.genre.join(', ') : ''}</p>
                            <h4>Phases</h4>
                            {/* Здесь берем фазы из viewCollection.launchpad.phases */}
                            {viewCollection.launchpad && viewCollection.launchpad.phases && viewCollection.launchpad.phases.length > 0 ? (
                                viewCollection.launchpad.phases.map((phase) => (
                                    <div key={phase.id} style={{ padding: '10px', border: '1px solid #ccc', marginBottom: '10px' }}>
                                        <p><strong>ID:</strong> {phase.id}</p>
                                        <p><strong>Display Name:</strong> {phase.displayName}</p>
                                        <p><strong>Start Time:</strong> {new Date(phase.startTime).toLocaleString()}</p>
                                        <p><strong>End Time:</strong> {new Date(phase.endTime).toLocaleString()}</p>
                                        <p><strong>Max Mint Per Address:</strong> {phase.maxMintPerAddress}</p>
                                        <p><strong>Price:</strong> {phase.price}</p>
                                        <p><strong>Is Public:</strong> {phase.isPublic ? 'Yes' : 'No'}</p>
                                        {phase.addressAllocations && phase.addressAllocations.length > 0 && (
                                            <p><strong>Address Allocations:</strong> {JSON.stringify(phase.addressAllocations)}</p>
                                        )}
                                        <button onClick={() => handleEditPhase(phase)} style={buttonStyle}>Edit Phase</button>
                                        <button onClick={() => handleDeletePhase(phase.id)} style={{ ...buttonStyle, backgroundColor: '#d32f2f' }}>Delete Phase</button>
                                    </div>
                                ))
                            ) : (
                                <p>No phases found in this collection.</p>
                            )}
                        </div>
                    )}

                    {/* Edit Collection Info Form */}
                    {viewCollection && (
                        <div style={{ marginTop: '30px', padding: '15px', border: '1px solid #aaa', borderRadius: '4px' }}>
                            <h3>Edit Collection Info</h3>
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    Title:
                                    <input type="text" value={editCollectionInfo.title || ''} onChange={(e) => setEditCollectionInfo({ ...editCollectionInfo, title: e.target.value })} style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                                </label>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    Creator:
                                    <input type="text" value={editCollectionInfo.creator || ''} onChange={(e) => setEditCollectionInfo({ ...editCollectionInfo, creator: e.target.value })} style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                                </label>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    Cover URL:
                                    <input type="text" value={editCollectionInfo.cover || ''} onChange={(e) => setEditCollectionInfo({ ...editCollectionInfo, cover: e.target.value })} style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                                </label>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    Wallet Address:
                                    <input type="text" value={editCollectionInfo.walletAddress || ''} onChange={(e) => setEditCollectionInfo({ ...editCollectionInfo, walletAddress: e.target.value })} style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                                </label>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    Is Popular:
                                    <input type="checkbox" checked={editCollectionInfo.isPopular || false} onChange={(e) => setEditCollectionInfo({ ...editCollectionInfo, isPopular: e.target.checked })} style={{ marginLeft: '10px' }} />
                                </label>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    Is Featured:
                                    <input type="checkbox" checked={editCollectionInfo.isFeatured || false} onChange={(e) => setEditCollectionInfo({ ...editCollectionInfo, isFeatured: e.target.checked })} style={{ marginLeft: '10px' }} />
                                </label>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    Is On Banner:
                                    <input type="checkbox" checked={editCollectionInfo.isOnBanner || false} onChange={(e) => setEditCollectionInfo({ ...editCollectionInfo, isOnBanner: e.target.checked })} style={{ marginLeft: '10px' }} />
                                </label>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    Genre (comma separated):
                                    <input type="text" value={editCollectionInfo.genre || ''} onChange={(e) => setEditCollectionInfo({ ...editCollectionInfo, genre: e.target.value })} style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                                </label>
                            </div>
                            <button onClick={handleUpdateCollectionInfo} style={buttonStyle}>Update Collection Info</button>
                        </div>
                    )}

                    {/* Edit Phase Form */}
                    {editPhaseData && (
                        <div style={{ marginTop: '30px', padding: '15px', border: '1px solid #aaa', borderRadius: '4px' }}>
                            <h3>Edit Phase</h3>
                            <p><strong>Phase ID:</strong> {editPhaseData.id}</p>
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    Display Name:
                                    <input type="text" value={editPhaseData.displayName || ''} onChange={(e) => handleEditPhaseChange('displayName', e.target.value)} style={{ marginLeft: '10px', padding: '5px', width: '250px' }} />
                                </label>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    Start Time (Unix Timestamp):
                                    <input type="number" value={editPhaseData.startTime || ''} onChange={(e) => handleEditPhaseChange('startTime', Number(e.target.value))} style={{ marginLeft: '10px', padding: '5px', width: '150px' }} />
                                </label>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    End Time (Unix Timestamp):
                                    <input type="number" value={editPhaseData.endTime || ''} onChange={(e) => handleEditPhaseChange('endTime', Number(e.target.value))} style={{ marginLeft: '10px', padding: '5px', width: '150px' }} />
                                </label>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    Max Mint Per Address:
                                    <input type="number" value={editPhaseData.maxMintPerAddress || ''} onChange={(e) => handleEditPhaseChange('maxMintPerAddress', Number(e.target.value))} style={{ marginLeft: '10px', padding: '5px', width: '100px' }} />
                                </label>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    Price (in satoshi):
                                    <input type="number" value={editPhaseData.price || ''} onChange={(e) => handleEditPhaseChange('price', Number(e.target.value))} style={{ marginLeft: '10px', padding: '5px', width: '100px' }} />
                                </label>
                            </div>
                            <div style={{ marginBottom: '10px' }}>
                                <label>
                                    Is Public:
                                    <input type="checkbox" checked={editPhaseData.isPublic || false} onChange={(e) => handleEditPhaseChange('isPublic', e.target.checked)} style={{ marginLeft: '10px' }} />
                                </label>
                            </div>
                            {!editPhaseData.isPublic && (
                                <div style={{ marginBottom: '10px' }}>
                                    <label>
                                        Address Allocations (JSON):
                                        <textarea value={editPhaseData.addressAllocations || ''} onChange={(e) => handleEditPhaseChange('addressAllocations', e.target.value)} style={{ marginLeft: '10px', padding: '5px', width: '300px', height: '60px' }} />
                                    </label>
                                </div>
                            )}
                            <button onClick={handleUpdatePhase} style={buttonStyle}>Update Phase</button>
                            <button onClick={() => setEditPhaseData(null)} style={{ ...buttonStyle, backgroundColor: '#757575' }}>Cancel</button>
                        </div>
                    )}

                    {/* Add/Update Address Allocation Form */}
                    <div style={{ marginTop: '30px', padding: '15px', border: '1px solid #ccc', borderRadius: '4px' }}>
                        <h3>Update Address Allocation</h3>
                        <div style={{ marginBottom: '10px' }}>
                            <label>
                                <strong>Phase ID:</strong>
                                <input type="text" value={allocationPhaseId} onChange={(e) => setAllocationPhaseId(e.target.value)} placeholder="Enter Phase ID" style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                            </label>
                        </div>
                        <div style={{ marginBottom: '10px' }}>
                            <label>
                                <strong>Address:</strong>
                                <input type="text" value={allocationAddress} onChange={(e) => setAllocationAddress(e.target.value)} placeholder="Enter Address" style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                            </label>
                        </div>
                        <div style={{ marginBottom: '10px' }}>
                            <label>
                                <strong>Max Mint Count:</strong>
                                <input type="number" value={allocationMaxMintCount} onChange={(e) => setAllocationMaxMintCount(e.target.value)} placeholder="Enter Max Mint Count" style={{ marginLeft: '10px', padding: '5px', width: '150px' }} />
                            </label>
                        </div>
                        <button onClick={handleUpdateAllocation} style={buttonStyle}>Update Allocation</button>
                    </div>
                </div>
            )}

            {/* Process Inscriptions Tab */}
            {activeTab === 'process' && (
                <div>
                    <h2>Process Inscriptions</h2>
                    <div style={{ marginBottom: '10px' }}>
                        <label>
                            <strong>Collection ID:</strong>
                            <input type="text" value={processCollectionID} onChange={(e) => setProcessCollectionID(e.target.value)} placeholder="Enter Collection ID" style={{ marginLeft: '10px', padding: '5px', width: '300px' }} />
                        </label>
                    </div>
                    <button onClick={handleProcessInscriptions} style={buttonStyle}>Process Inscriptions</button>
                </div>
            )}

            {/* Status Block */}
            <div style={{
                marginTop: '30px',
                padding: '15px',
                border: '1px solid #ccc',
                minHeight: '60px',
                whiteSpace: 'pre-wrap',
                backgroundColor: '#f9f9f9',
                borderRadius: '4px'
            }}>
                <strong>Status:</strong> {status || 'Awaiting actions.'}
            </div>
        </div>
    );
}

export default App;
