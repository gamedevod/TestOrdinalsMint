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

    // Общие состояния
    const [status, setStatus] = useState('');

    const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

    // Функция подключения Xverse кошелька
    const connectXverse = async () => {
        try {
            const params = {
                purposes: ['payment', 'ordinals'],
                message: 'Пожалуйста, подключите свой кошелек для подписания PSBT.'
            };

            const response = await request('getAccounts', params);
            console.log("Xverse getAccounts response:", response);

            if (response.status === 'success') {
                setXverseAddresses(response.result);
                setXverseConnected(true);
                setStatus('Xverse кошелек подключен.');
            } else {
                if (response.error.code === RpcErrorCode.USER_REJECTION) {
                    alert("Пользователь отклонил запрос на подключение Xverse кошелька.");
                } else {
                    alert("Ошибка подключения Xverse кошелька: " + response.error.message);
                }
            }
        } catch (err) {
            console.error(err);
            alert("Ошибка подключения Xverse кошелька: " + err.message);
        }
    };

    // Функция подключения UniSat Wallet
    const connectUniSat = async () => {
        console.log(API_BASE_URL)
        try {
            if (typeof window.unisat === 'undefined') {
                alert('UniSat Wallet не обнаружен. Пожалуйста, установите расширение UniSat.');
                return;
            }

            setStatus('Подключение к UniSat Wallet...');
            const accounts = await window.unisat.requestAccounts();
            if (accounts && accounts.length > 0) {
                setUniSatAddress(accounts[0]);
                setUniSatConnected(true);
                setStatus(`UniSat Wallet подключен: ${accounts[0]}`);

                // Получение публичного ключа пользователя
                try {
                    if (typeof window.unisat.getPublicKey === 'function') {
                        const publicKey = await window.unisat.getPublicKey();
                        setUniSatPublicKey(publicKey);
                        console.log('UniSat User Public Key:', publicKey);
                    } else {
                        // Если метод отсутствует, используем заглушку или запросите у пользователя
                        setUniSatPublicKey('placeholder_public_key');
                        console.warn('Метод getPublicKey не найден. Используется заглушка.');
                    }
                } catch (pkError) {
                    console.error('Ошибка получения публичного ключа UniSat:', pkError);
                    setStatus(`Ошибка получения публичного ключа UniSat: ${pkError.message}`);
                }
            } else {
                setStatus('Не удалось получить адрес кошелька UniSat.');
            }
        } catch (error) {
            console.error('Ошибка подключения UniSat Wallet:', error);
            setStatus(`Ошибка подключения UniSat Wallet: ${error.message}`);
        }
    };

    // Функция подключения OKX Wallet
    const connectOKX = async () => {
        try {
            if (typeof window.okxwallet === 'undefined' || typeof window.okxwallet.bitcoinSignet === 'undefined') {
                alert('OKX Wallet (Signet) не обнаружен. Пожалуйста, установите расширение OKX Wallet версии 2.82.32 или выше.');
                return;
            }

            setStatus('Подключение к OKX Wallet...');
            const result = await window.okxwallet.bitcoinSignet.connect();
            console.log('OKX Connect Response:', result);

            if (result.address && result.publicKey) {
                setOkxAddress(result.address);
                setOkxPublicKey(result.publicKey);
                setOkxConnected(true);
                setStatus(`OKX Wallet подключен: ${result.address}`);
            } else {
                throw new Error('Не удалось получить адрес или публичный ключ из OKX Wallet.');
            }
        } catch (error) {
            console.error('Ошибка подключения OKX Wallet:', error);
            setStatus(`Ошибка подключения OKX Wallet: ${error.message}`);
        }
    };

    // Функция Minting через OKX
    const getAndSignPsbtOKX = async () => {
        if (!okxConnected) {
            alert("Пожалуйста, сначала подключите OKX Wallet.");
            return;
        }

        try {
            setStatus('Инициация Minting через OKX...');

            // Шаг 1: Инициация Minting
            const initiateResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/minting`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    buyer_address: okxAddress,
                    buyer_public_key: okxPublicKey
                })
            });

            if (!initiateResponse.ok) {
                throw new Error(`Ошибка инициации Minting: ${initiateResponse.status} ${initiateResponse.statusText}`);
            }

            const initiateData = await initiateResponse.json();
            const psbtHex = initiateData.psbt_hex;
            const buyerInputIndices = initiateData.buyer_input_indices;
            console.log('OKX Initiate Minting Response:', initiateData);

            if (!psbtHex) {
                throw new Error('PSBT не получен от сервера.');
            }

            // Подписание PSBT через OKX
            setStatus('Подписание PSBT через OKX...');
            const toSignInputs = buyerInputIndices.map(index => ({
                index: index,
                address: okxAddress
            }));

            const signedPsbtHex = await window.okxwallet.bitcoinSignet.signPsbt(psbtHex, {
                autoFinalized: false, // Автофинализация
                toSignInputs: toSignInputs
            });

            if (!signedPsbtHex) {
                throw new Error('Подписание PSBT через OKX не удалось.');
            }

            console.log('OKX Signed PSBT (Hex):', signedPsbtHex);

            // Шаг 2: Завершение Minting
            setStatus('Завершение Minting через OKX...');
            const completeResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/complete`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    psbt_hex: signedPsbtHex // Отправляем hex-строку
                })
            });

            if (!completeResponse.ok) {
                throw new Error(`Ошибка завершения Minting: ${completeResponse.status} ${completeResponse.statusText}`);
            }

            const completeData = await completeResponse.json();
            console.log("OKX Complete Minting Response:", completeData);
            setStatus(`Minting успешно завершен. TXID: ${completeData.transaction_id}`);

        } catch (error) {
            console.error('OKX Mint Error:', error);
            setStatus(`Mint Error: ${error.message}`);
        }
    };

    // Функция Minting через Xverse
    const getAndSignPsbtXverse = async () => {
        if (!xverseConnected) {
            alert("Пожалуйста, сначала подключите Xverse кошелек.");
            return;
        }

        try {
            setStatus('Инициация Minting через Xverse...');

            // Шаг 1: Инициация Minting
            const initiateResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/minting`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    buyer_address: xverseAddresses.find(addr => addr.purpose === AddressPurpose.Ordinals)?.address || '',
                    buyer_public_key: xverseAddresses.find(addr => addr.purpose === AddressPurpose.Payment)?.publicKey || ''
                })
            });

            if (!initiateResponse.ok) {
                throw new Error(`Ошибка инициации Minting: ${initiateResponse.status} ${initiateResponse.statusText}`);
            }

            const initiateData = await initiateResponse.json();
            const psbtHex = initiateData.psbt_hex;
            const buyerInputIndices = initiateData.buyer_input_indices;
            console.log('Xverse Initiate Minting Response:', initiateData);

            if (!psbtHex) {
                throw new Error('PSBT не получен от сервера.');
            }

            // Подписание PSBT через Xverse
            setStatus('Подписание PSBT через Xverse...');
            const toSignInputs = buyerInputIndices.map(index => ({
                index: index,
                address: xverseAddresses.find(addr => addr.purpose === AddressPurpose.Payment)?.address || ''
            }));

            const signedPsbtHex = await window.xverse.signPsbt(psbtHex, {
                autoFinalized: false, // Автофинализация
                toSignInputs: toSignInputs
            });

            if (!signedPsbtHex) {
                throw new Error('Подписание PSBT через Xverse не удалось.');
            }

            console.log('Xverse Signed PSBT (Hex):', signedPsbtHex);

            // Шаг 2: Завершение Minting
            setStatus('Завершение Minting через Xverse...');
            const completeResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/complete`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    psbt_hex: signedPsbtHex // Отправляем hex-строку
                })
            });

            if (!completeResponse.ok) {
                throw new Error(`Ошибка завершения Minting: ${completeResponse.status} ${completeResponse.statusText}`);
            }

            const completeData = await completeResponse.json();
            console.log("Xverse Complete Minting Response:", completeData);
            setStatus(`Minting успешно завершен. TXID: ${completeData.transaction_id}`);

        } catch (error) {
            console.error('Xverse Mint Error:', error);
            setStatus(`Mint Error: ${error.message}`);
        }
    };

    // Функция Minting через UniSat
    const getAndSignPsbtUniSat = async () => {
        if (!uniSatConnected) {
            alert("Пожалуйста, сначала подключите UniSat Wallet.");
            return;
        }

        try {
            setStatus('Инициация Minting через UniSat...');

            // Шаг 1: Инициация Minting
            const initiateResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/minting`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    buyer_address: uniSatAddress,
                    buyer_public_key: uniSatPublicKey
                })
            });

            if (!initiateResponse.ok) {
                throw new Error(`Ошибка инициации Minting: ${initiateResponse.status} ${initiateResponse.statusText}`);
            }

            const initiateData = await initiateResponse.json();
            const psbtHex = initiateData.psbt_hex;
            const buyerInputIndices = initiateData.buyer_input_indices;
            console.log('UniSat Initiate Minting Response:', initiateData);

            if (!psbtHex) {
                throw new Error('PSBT не получен от сервера.');
            }

            // Подписание PSBT через UniSat
            setStatus('Подписание PSBT через UniSat...');
            const toSignInputs = buyerInputIndices.map(index => ({
                index: index,
                address: uniSatAddress
            }));

            const signedPsbtHex = await window.unisat.signPsbt(psbtHex, {
                autoFinalized: false, // Автофинализация
                toSignInputs: toSignInputs
            });

            if (!signedPsbtHex) {
                throw new Error('Подписание PSBT через UniSat не удалось.');
            }

            console.log('UniSat Signed PSBT (Hex):', signedPsbtHex);

            // Шаг 2: Завершение Minting
            setStatus('Завершение Minting через UniSat...');
            const completeResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/complete`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    psbt_hex: signedPsbtHex // Отправляем hex-строку
                })
            });

            if (!completeResponse.ok) {
                throw new Error(`Ошибка завершения Minting: ${completeResponse.status} ${completeResponse.statusText}`);
            }

            const completeData = await completeResponse.json();
            console.log("UniSat Complete Minting Response:", completeData);
            setStatus(`Minting успешно завершен. TXID: ${completeData.transaction_id}`);

        } catch (error) {
            console.error('UniSat Mint Error:', error);
            setStatus(`Mint Error: ${error.message}`);
        }
    };

    return (
        <div style={{ padding: '20px' }}>
            <h1>Xverse & UniSat Wallet PSBT Signer</h1>

            <h1>OKX Wallet (Signet) PSBT Signer</h1>

            {/* Подключение OKX кошелька */}
            <div style={{ marginBottom: '20px' }}>
                {!okxConnected ? (
                    <button onClick={connectOKX}>Подключить OKX Wallet</button>
                ) : (
                    <p>✅ OKX Wallet подключен: {okxAddress}</p>
                )}
            </div>

            {/* Подключение Xverse кошелька */}
            <div style={{ marginBottom: '20px' }}>
                {!xverseConnected ? (
                    <button onClick={connectXverse}>Подключить Xverse кошелек</button>
                ) : (
                    <p>✅ Xverse кошелек подключен.</p>
                )}
            </div>

            {/* Подключение UniSat кошелька */}
            <div style={{ marginBottom: '20px' }}>
                {!uniSatConnected ? (
                    <button onClick={connectUniSat}>Подключить UniSat Wallet</button>
                ) : (
                    <p>✅ UniSat Wallet подключен: {uniSatAddress}</p>
                )}
            </div>

            {/* Удаление поля ввода ID Launchpad */}
            {/* <div>
                <label>ID Launchpad: </label>
                <input type="text" value={lpId} onChange={handleLpIdChange} />
            </div> */}

            {/* Действия для Xverse кошелька */}
            {xverseConnected && (
                <div style={{ marginTop: '20px' }}>
                    <button onClick={getAndSignPsbtXverse}>Minting (Xverse)</button>
                </div>
            )}

            {/* Действия для UniSat кошелька */}
            {uniSatConnected && (
                <div style={{ marginTop: '20px' }}>
                    <button onClick={getAndSignPsbtUniSat}>Minting (UniSat)</button>
                </div>
            )}

            {/* Действия для OKX кошелька */}
            {okxConnected && (
                <div style={{ marginTop: '20px' }}>
                    <button onClick={getAndSignPsbtOKX}>Minting (OKX)</button>
                </div>
            )}

            {/* Блок статуса */}
            <div style={{
                marginTop: '20px',
                padding: '10px',
                border: '1px solid #ccc',
                minHeight: '50px',
                whiteSpace: 'pre-wrap',
                backgroundColor: '#f9f9f9',
                borderRadius: '4px'
            }}>
                <strong>Status:</strong> {status || 'Ожидание действий.'}
            </div>
        </div>
    );
}

export default App;
