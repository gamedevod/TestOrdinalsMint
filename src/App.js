// src/App.js
import React, { useState } from 'react';
import { request, RpcErrorCode, AddressPurpose } from '@sats-connect/core';
import * as bitcoin from 'bitcoinjs-lib';

function App() {
    // States for OKX Wallet
    const [okxConnected, setOkxConnected] = useState(false);
    const [okxAddress, setOkxAddress] = useState('');
    const [okxPublicKey, setOkxPublicKey] = useState('');

    // States for Xverse Wallet
    const [xverseConnected, setXverseConnected] = useState(false);
    const [xverseAddresses, setXverseAddresses] = useState([]);

    // States for UniSat Wallet
    const [uniSatConnected, setUniSatConnected] = useState(false);
    const [uniSatAddress, setUniSatAddress] = useState('');
    const [uniSatPublicKey, setUniSatPublicKey] = useState('');
    const [inscriptionID, setInscriptionID] = useState('');

    // Common states
    const [status, setStatus] = useState('');

    const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

    // Function to connect Xverse wallet
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

    // Function to connect UniSat Wallet
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

                // Retrieve user's public key
                try {
                    if (typeof window.unisat.getPublicKey === 'function') {
                        const publicKey = await window.unisat.getPublicKey();
                        setUniSatPublicKey(publicKey);
                        console.log('UniSat User Public Key:', publicKey);
                    } else {
                        // If the method is missing, use a placeholder or prompt the user
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

    // Function to connect OKX Wallet
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

    // Function for Minting via OKX
    const getAndSignPsbtOKX = async () => {
        if (!okxConnected) {
            alert("Please connect the OKX Wallet first.");
            return;
        }

        try {
            setStatus('Initiating Minting via OKX...');

            // Step 1: Initiate Minting
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
                throw new Error(`Error initiating Minting: ${initiateResponse.status} ${initiateResponse.statusText}`);
            }

            const initiateData = await initiateResponse.json();
            const psbtHex = initiateData.psbt_hex;
            const buyerInputIndices = initiateData.buyer_input_indices;
            const receivedInscriptionID = initiateData.inscription_id; // Retrieve inscriptionID
            console.log('OKX Initiate Minting Response:', initiateData);

            if (!psbtHex) {
                throw new Error('PSBT not received from the server.');
            }

            // Save inscriptionID to state
            setInscriptionID(receivedInscriptionID);

            // Sign PSBT via OKX
            setStatus('Signing PSBT via OKX...');
            const toSignInputs = buyerInputIndices.map(index => ({
                index: index,
                address: okxAddress
            }));

            const signedPsbtHex = await window.okxwallet.bitcoinSignet.signPsbt(psbtHex, {
                autoFinalized: false, // Auto-finalization
                toSignInputs: toSignInputs
            });

            if (!signedPsbtHex) {
                throw new Error('Failed to sign PSBT via OKX.');
            }

            console.log('OKX Signed PSBT (Hex):', signedPsbtHex);

            // Step 2: Complete Minting
            setStatus('Completing Minting via OKX...');
            const completeResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/complete`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    psbt_hex: signedPsbtHex, // Send hex string
                    inscription_id: receivedInscriptionID // Send inscriptionID
                })
            });

            if (!completeResponse.ok) {
                throw new Error(`Error completing Minting: ${completeResponse.status} ${completeResponse.statusText}`);
            }

            const completeData = await completeResponse.json();
            console.log("OKX Complete Minting Response:", completeData);
            setStatus(`Minting successfully completed. TXID: ${completeData.transaction_id}`);

            // Reset inscriptionID after successful transaction
            setInscriptionID('');
        } catch (error) {
            console.error('OKX Mint Error:', error);
            setStatus(`Mint Error: ${error.message}`);
        }
    };


    // Function for Minting via Xverse
    const getAndSignPsbtXverse = async () => {
        if (!xverseConnected) {
            alert("Please connect the Xverse wallet first.");
            return;
        }

        try {
            setStatus('Initiating Minting via Xverse...');

            // Step 1: Initiate Minting
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
                throw new Error(`Error initiating Minting: ${initiateResponse.status} ${initiateResponse.statusText}`);
            }

            const initiateData = await initiateResponse.json();
            const psbtHex = initiateData.psbt_hex;
            const buyerInputIndices = initiateData.buyer_input_indices;
            const receivedInscriptionID = initiateData.inscription_id; // Retrieve inscriptionID
            console.log('Xverse Initiate Minting Response:', initiateData);

            if (!psbtHex) {
                throw new Error('PSBT not received from the server.');
            }

            // Save inscriptionID to state
            setInscriptionID(receivedInscriptionID);

            // Sign PSBT via Xverse
            setStatus('Signing PSBT via Xverse...');
            const toSignInputs = buyerInputIndices.map(index => ({
                index: index,
                address: xverseAddresses.find(addr => addr.purpose === AddressPurpose.Payment)?.address || ''
            }));

            const signedPsbtHex = await window.xverse.signPsbt(psbtHex, {
                autoFinalized: false, // Auto-finalization
                toSignInputs: toSignInputs
            });

            if (!signedPsbtHex) {
                throw new Error('Failed to sign PSBT via Xverse.');
            }

            console.log('Xverse Signed PSBT (Hex):', signedPsbtHex);

            // Step 2: Complete Minting
            setStatus('Completing Minting via Xverse...');
            const completeResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/complete`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    psbt_hex: signedPsbtHex, // Send hex string
                    inscription_id: receivedInscriptionID // Send inscriptionID
                })
            });

            if (!completeResponse.ok) {
                throw new Error(`Error completing Minting: ${completeResponse.status} ${completeResponse.statusText}`);
            }

            const completeData = await completeResponse.json();
            console.log("Xverse Complete Minting Response:", completeData);
            setStatus(`Minting successfully completed. TXID: ${completeData.transaction_id}`);

            // Reset inscriptionID after successful transaction
            setInscriptionID('');
        } catch (error) {
            console.error('Xverse Mint Error:', error);
            setStatus(`Mint Error: ${error.message}`);
        }
    };



    // Function for Minting via UniSat
    const getAndSignPsbtUniSat = async () => {
        if (!uniSatConnected) {
            alert("Please connect the UniSat Wallet first.");
            return;
        }

        try {
            setStatus('Initiating Minting via UniSat...');

            // Step 1: Initiate Minting
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
                throw new Error(`Error initiating Minting: ${initiateResponse.status} ${initiateResponse.statusText}`);
            }

            const initiateData = await initiateResponse.json();
            const psbtHex = initiateData.psbt_hex;
            const buyerInputIndices = initiateData.buyer_input_indices;
            const receivedInscriptionID = initiateData.inscription_id; // Retrieve inscriptionID
            console.log('UniSat Initiate Minting Response:', initiateData);

            if (!psbtHex) {
                throw new Error('PSBT not received from the server.');
            }

            // Save inscriptionID to state
            setInscriptionID(receivedInscriptionID);

            // Sign PSBT via UniSat
            setStatus('Signing PSBT via UniSat...');
            const toSignInputs = buyerInputIndices.map(index => ({
                index: index,
                address: uniSatAddress
            }));

            const signedPsbtHex = await window.unisat.signPsbt(psbtHex, {
                autoFinalized: false, // Auto-finalization
                toSignInputs: toSignInputs
            });

            if (!signedPsbtHex) {
                throw new Error('Failed to sign PSBT via UniSat.');
            }

            console.log('UniSat Signed PSBT (Hex):', signedPsbtHex);

            // Step 2: Complete Minting
            setStatus('Completing Minting via UniSat...');
            const completeResponse = await fetch(`${API_BASE_URL}/psbt/v1/transactions/complete`, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    psbt_hex: signedPsbtHex, // Send hex string
                    inscription_id: receivedInscriptionID // Send inscriptionID
                })
            });

            if (!completeResponse.ok) {
                throw new Error(`Error completing Minting: ${completeResponse.status} ${completeResponse.statusText}`);
            }

            const completeData = await completeResponse.json();
            console.log("UniSat Complete Minting Response:", completeData);
            setStatus(`Minting successfully completed. TXID: ${completeData.transaction_id}`);

            // Reset inscriptionID after successful transaction
            setInscriptionID('');
        } catch (error) {
            console.error('UniSat Mint Error:', error);
            setStatus(`Mint Error: ${error.message}`);
        }
    };



    return (
        <div style={{ padding: '20px' }}>
            <h1>Xverse & UniSat Wallet PSBT Signer</h1>

            <h1>OKX Wallet (Signet) PSBT Signer</h1>

            {/* Connect OKX Wallet */}
            <div style={{ marginBottom: '20px' }}>
                {!okxConnected ? (
                    <button onClick={connectOKX}>Connect OKX Wallet</button>
                ) : (
                    <p>✅ OKX Wallet connected: {okxAddress}</p>
                )}
            </div>

            {/* Connect Xverse Wallet */}
            <div style={{ marginBottom: '20px' }}>
                {!xverseConnected ? (
                    <button onClick={connectXverse}>Connect Xverse Wallet</button>
                ) : (
                    <p>✅ Xverse Wallet connected.</p>
                )}
            </div>

            {/* Connect UniSat Wallet */}
            <div style={{ marginBottom: '20px' }}>
                {!uniSatConnected ? (
                    <button onClick={connectUniSat}>Connect UniSat Wallet</button>
                ) : (
                    <p>✅ UniSat Wallet connected: {uniSatAddress}</p>
                )}
            </div>

            {/* Display inscriptionID */}
            <div style={{ marginTop: '20px', padding: '10px', border: '1px solid #ccc' }}>
                <strong>Inscription ID:</strong> {inscriptionID || 'No inscription selected'}
            </div>

            {/* Actions for Xverse Wallet */}
            {xverseConnected && (
                <div style={{ marginTop: '20px' }}>
                    <button onClick={getAndSignPsbtXverse}>Minting (Xverse)</button>
                </div>
            )}

            {/* Actions for UniSat Wallet */}
            {uniSatConnected && (
                <div style={{ marginTop: '20px' }}>
                    <button onClick={getAndSignPsbtUniSat}>Minting (UniSat)</button>
                </div>
            )}

            {/* Actions for OKX Wallet */}
            {okxConnected && (
                <div style={{ marginTop: '20px' }}>
                    <button onClick={getAndSignPsbtOKX}>Minting (OKX)</button>
                </div>
            )}

            {/* Status Block */}
            <div style={{
                marginTop: '20px',
                padding: '10px',
                border: '1px solid #ccc',
                minHeight: '50px',
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
