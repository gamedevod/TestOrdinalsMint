// src/App.js
import React, { useState } from 'react';
import { request, RpcErrorCode, AddressPurpose } from '@sats-connect/core';
import * as bitcoin from 'bitcoinjs-lib';

function App() {
    // Состояния для OKX Wallet
    const [okxConnected, setOkxConnected] = useState(false);
    const [okxAddress, setOkxAddress] = useState('');
    const [okxPublicKey, setOkxPublicKey] = useState('');

    // Состояния для Xverse Wallet
    const [xverseConnected, setXverseConnected] = useState(false);
    const [xverseAddresses, setXverseAddresses] = useState([]);

    // Состояния для UniSat Wallet
    const [uniSatConnected, setUniSatConnected] = useState(false);
    const [uniSatAddress, setUniSatAddress] = useState('');
    const [uniSatPublicKey, setUniSatPublicKey] = useState('');
    const [inscriptionID, setInscriptionID] = useState('');

    // Новые состояния для collectionID и feeRate
    const [collectionID, setCollectionID] = useState('');
    const [feeRate, setFeeRate] = useState('');

    // Общее состояние для статуса
    const [status, setStatus] = useState('');

    const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
    const [transactionId, setTransactionId] = useState('');

    // Стили для кнопок для поддержания консистентного UI
    const buttonStyle = {
        padding: '10px 20px',
        backgroundColor: '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '16px'
    };

    // Функция для обработки изменения Collection ID
    const handleCollectionIDChange = (e) => {
        setCollectionID(e.target.value);
    };

    // Функция для обработки изменения Fee Rate
    const handleFeeRateChange = (e) => {
        setFeeRate(e.target.value);
    };

    // Функция подключения Xverse кошелька
    const connectXverse = async () => {
        try {
            const params = {
                purposes: ['payment', 'ordinals'],
                message: 'Please connect your wallet to sign the PSBT.'
            };

            const response = await request('getAccounts', params);
            console.log("Xverse getAccounts response:", response);

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
            console.error(err);
            alert("Error connecting Xverse wallet: " + err.message);
        }
    };

    // Функция подключения UniSat кошелька
    const connectUniSat = async () => {
        console.log(API_BASE_URL)
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

                // Получение публичного ключа пользователя
                try {
                    if (typeof window.unisat.getPublicKey === 'function') {
                        const publicKey = await window.unisat.getPublicKey();
                        setUniSatPublicKey(publicKey);
                        console.log('UniSat User Public Key:', publicKey);
                    } else {
                        // Если метод отсутствует, используем заполнитель или запрашиваем у пользователя
                        setUniSatPublicKey('placeholder_public_key');
                        console.warn('getPublicKey method not found. Using placeholder.');
                    }
                } catch (pkError) {
                    console.error('Error retrieving UniSat public key:', pkError);
                    setStatus(`Error retrieving UniSat public key: ${pkError.message}`);
                }
            } else {
                setStatus('Failed to retrieve UniSat wallet address.');
            }
        } catch (error) {
            console.error('Error connecting UniSat Wallet:', error);
            setStatus(`Error connecting UniSat Wallet: ${error.message}`);
        }
    };

    // Функция подключения OKX кошелька
    const connectOKX = async () => {
        try {
            if (typeof window.okxwallet === 'undefined' || typeof window.okxwallet.bitcoinSignet === 'undefined') {
                alert('OKX Wallet (Signet) not found. Please install the OKX Wallet extension version 2.82.32 or higher.');
                return;
            }

            setStatus('Connecting to OKX Wallet...');
            const result = await window.okxwallet.bitcoinSignet.connect();
            console.log('OKX Connect Response:', result);

            if (result.address && result.publicKey) {
                setOkxAddress(result.address);
                setOkxPublicKey(result.publicKey);
                setOkxConnected(true);
                setStatus(`OKX Wallet connected: ${result.address}`);
            } else {
                throw new Error('Failed to retrieve address or public key from OKX Wallet.');
            }
        } catch (error) {
            console.error('Error connecting OKX Wallet:', error);
            setStatus(`Error connecting OKX Wallet: ${error.message}`);
        }
    };

    /**
     * Функция для инициирования и подписания PSBT для разных кошельков
     * @param {string} walletType - Тип кошелька ('OKX', 'Xverse', 'UniSat')
     */
    const getAndSignPsbt = async (walletType) => {
        let buyerAddress, buyerPublicKey, signPsbtFunction;
        let buyerReceiverAddress = '';

        // Валидация ввода Collection ID
        if (!collectionID.trim()) {
            alert("Please enter a Collection ID.");
            return;
        }

        // Валидация и получение других необходимых полей
        switch(walletType) {
            case 'OKX':
                if (!okxConnected) {
                    alert("Please connect the OKX Wallet first.");
                    return;
                }
                buyerAddress = okxAddress;
                buyerPublicKey = okxPublicKey;
                signPsbtFunction = window.okxwallet.bitcoinSignet.signPsbt;
                buyerReceiverAddress = buyerAddress; // Для OKX устанавливаем receiver как buyer
                break;
            case 'Xverse':
                if (!xverseConnected) {
                    alert("Please connect the Xverse wallet first.");
                    return;
                }
                buyerAddress = xverseAddresses.find(addr => addr.purpose === AddressPurpose.Payment)?.address || '';
                buyerPublicKey = xverseAddresses.find(addr => addr.purpose === AddressPurpose.Payment)?.publicKey || '';
                signPsbtFunction = window.xverse.signPsbt;
                buyerReceiverAddress = xverseAddresses.find(addr => addr.purpose === AddressPurpose.Ordinals)?.address || buyerAddress;
                break;
            case 'UniSat':
                if (!uniSatConnected) {
                    alert("Please connect the UniSat Wallet first.");
                    return;
                }
                buyerAddress = uniSatAddress;
                buyerPublicKey = uniSatPublicKey;
                signPsbtFunction = window.unisat.signPsbt;
                buyerReceiverAddress = buyerAddress; // Для UniSat устанавливаем receiver как buyer
                break;
            default:
                alert("Unsupported wallet type.");
                return;
        }

        // Валидация ввода Fee Rate
        const feeRateNumber = parseInt(feeRate, 10);
        if (isNaN(feeRateNumber) || feeRateNumber <= 0) {
            alert("Please enter a valid Fee Rate.");
            return;
        }

        try {
            setStatus(`Initiating Minting via ${walletType}...`);

            // Шаг 1: Инициирование Minting с необходимыми полями
            const initiateResponse = await fetch(`${API_BASE_URL}/psbt/v1/mint/init`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    buyerPaymentAddress: buyerAddress,
                    buyerPaymentPublicKey: buyerPublicKey,
                    buyerReceiverAddress: buyerReceiverAddress,
                    collectionId: collectionID,
                    feeRate: feeRateNumber
                })
            });

            if (!initiateResponse.ok) {
                let errorMsg = `Error initiating Minting: ${initiateResponse.status} ${initiateResponse.statusText}`;
                try {
                    const errorData = await initiateResponse.json();
                    errorMsg += ` - ${errorData.message}`;
                } catch (e) {
                    // Не удалось разобрать ошибку
                }
                throw new Error(errorMsg);
            }

            const initiateData = await initiateResponse.json();
            const psbtHex = initiateData.psbtHex;
            const buyerInputIndices = initiateData.buyerInputIndices;
            const receivedInscriptionID = initiateData.inscriptionID;
            const receivedTransactionID = initiateData.transactionId; // New line
            console.log(`${walletType} Initiate Minting Response:`, initiateData);

            if (!psbtHex) {
                throw new Error('PSBT not received from the server.');
            }

            // Сохранение inscriptionID в состояние
            setInscriptionID(receivedInscriptionID);
            setTransactionId(receivedTransactionID);

            // Подписание PSBT
            setStatus(`Signing PSBT via ${walletType}...`);
            const toSignInputs = buyerInputIndices.map(index => ({
                index: index,
                address: buyerAddress
            }));
            if (toSignInputs.some(input => input.index === 0)) {
                throw new Error("Invalid input index 0 found in buyerInputIndices.");
            }
            const signedPsbtHex = await signPsbtFunction(psbtHex, {
                autoFinalized: false, // Автоматическая финализация
                toSignInputs: toSignInputs
            });

            if (!signedPsbtHex) {
                throw new Error(`Failed to sign PSBT via ${walletType}.`);
            }

            console.log(`${walletType} Signed PSBT (Hex):`, signedPsbtHex);

            // Шаг 2: Завершение Minting
            setStatus(`Completing Minting via ${walletType}...`);
            const completeResponse = await fetch(`${API_BASE_URL}/psbt/v1/mint/complete`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    transactionId: receivedTransactionID, // Include Transaction ID
                    psbtHex: signedPsbtHex // Отправка PSBT Hex строки
                })
            });

            if (!completeResponse.ok) {
                let errorMsg = `Error completing Minting: ${completeResponse.status} ${completeResponse.statusText}`;
                try {
                    const errorData = await completeResponse.json();
                    errorMsg += ` - ${errorData.message}`;
                } catch (e) {
                    // Не удалось разобрать ошибку
                }
                throw new Error(errorMsg);
            }

            const completeData = await completeResponse.json();
            console.log(`${walletType} Complete Minting Response:`, completeData);
            setStatus(`Minting successfully completed via ${walletType}. TXID: ${completeData.transactionID}`);

            // Сброс inscriptionID после успешной транзакции
            setInscriptionID('');
            setTransactionId('');
        } catch (error) {
            console.error(`${walletType} Mint Error:`, error);
            setStatus(`Mint Error (${walletType}): ${error.message}`);
        }
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
            <h1>Xverse, UniSat & OKX Wallet PSBT Signer</h1>

            {/* Поле ввода Collection ID */}
            <div style={{ marginBottom: '20px' }}>
                <label>
                    <strong>Collection ID:</strong>
                    <input
                        type="text"
                        value={collectionID}
                        onChange={handleCollectionIDChange}
                        placeholder="Enter Collection ID"
                        style={{ marginLeft: '10px', padding: '5px', width: '300px' }}
                    />
                </label>
            </div>

            {/* Поле ввода Fee Rate */}
            <div style={{ marginBottom: '20px' }}>
                <label>
                    <strong>Fee Rate (sats/byte):</strong>
                    <input
                        type="number"
                        value={feeRate}
                        onChange={handleFeeRateChange}
                        placeholder="Enter Fee Rate"
                        style={{ marginLeft: '10px', padding: '5px', width: '100px' }}
                        min="1"
                    />
                </label>
            </div>

            {/* Подключение OKX Wallet */}
            <div style={{ marginBottom: '20px' }}>
                {!okxConnected ? (
                    <button onClick={connectOKX} style={buttonStyle}>Connect OKX Wallet</button>
                ) : (
                    <p>✅ OKX Wallet connected: {okxAddress}</p>
                )}
            </div>

            {/* Подключение Xverse Wallet */}
            <div style={{ marginBottom: '20px' }}>
                {!xverseConnected ? (
                    <button onClick={connectXverse} style={buttonStyle}>Connect Xverse Wallet</button>
                ) : (
                    <p>✅ Xverse Wallet connected.</p>
                )}
            </div>

            {/* Подключение UniSat Wallet */}
            <div style={{ marginBottom: '20px' }}>
                {!uniSatConnected ? (
                    <button onClick={connectUniSat} style={buttonStyle}>Connect UniSat Wallet</button>
                ) : (
                    <p>✅ UniSat Wallet connected: {uniSatAddress}</p>
                )}
            </div>

            {/* Отображение inscriptionID */}
            <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
                <strong>Inscription ID:</strong> {inscriptionID || 'No inscription selected'}
            </div>

            {/* Действия для Xverse Wallet */}
            {xverseConnected && (
                <div style={{ marginTop: '20px' }}>
                    <button onClick={() => getAndSignPsbt('Xverse')} style={buttonStyle}>Minting (Xverse)</button>
                </div>
            )}

            {/* Действия для UniSat Wallet */}
            {uniSatConnected && (
                <div style={{ marginTop: '20px' }}>
                    <button onClick={() => getAndSignPsbt('UniSat')} style={buttonStyle}>Minting (UniSat)</button>
                </div>
            )}

            {/* Действия для OKX Wallet */}
            {okxConnected && (
                <div style={{ marginTop: '20px' }}>
                    <button onClick={() => getAndSignPsbt('OKX')} style={buttonStyle}>Minting (OKX)</button>
                </div>
            )}
            {/* Display Transaction ID */}
            <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #ccc', borderRadius: '4px' }}>
                <strong>Transaction ID:</strong> {transactionId || 'No transaction initiated'}
            </div>
            {/* Блок статуса */}
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
