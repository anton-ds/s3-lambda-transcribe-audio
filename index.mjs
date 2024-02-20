import { S3 } from '@aws-sdk/client-s3';
import {
	SecretsManagerClient,
	GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

import crypto from 'crypto';
import fs from 'fs';
import https from 'https';
import path from 'path';

const s3 = new S3();

const streamToBuffer = async (readable) => {
	const chunks = [];
	for await (const chunk of readable) {
		chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
	}

	return Buffer.concat(chunks);
};

const fileIsAudio = async (fileBucketObject) => {
	const { ContentType } = await s3.headObject(fileBucketObject);
	return ContentType.startsWith('audio/');
};

const generateBoundary = () => {
	return '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex');
};

const getToken = async (regionCode) => {
	const client = new SecretsManagerClient({
		region: regionCode,
	});

	let response;

	try {
		response = await client.send(
			new GetSecretValueCommand({
				SecretId: process.env.openai_key,
				VersionStage: 'AWSCURRENT',
			})
		);
	} catch (error) {
		throw error;
	}

	return response.SecretString;
};

const downloadFile = async (fileBucketObject) => {
	const fileExtension = path.extname(fileBucketObject.Key);
	const uniqFileName = 'audio_' + crypto.randomBytes(14).toString('hex');
	const tempFilePath = path.join('/tmp', `${uniqFileName}${fileExtension}`);

	const fileData = await s3.getObject(fileBucketObject);
	const buffer = await streamToBuffer(fileData.Body);

	fs.writeFileSync(tempFilePath, buffer);

	return tempFilePath;
};

const sendAudioToOpenAI = async (filePath, token) => {
	const fileContent = fs.readFileSync(filePath);
	const fileExtension = path.extname(filePath).substring(1);
	const boundary = generateBoundary();

	const postDataStart =
		`--${boundary}\r\n` +
		`Content-Disposition: form-data; name="file"; filename="${path.basename(filePath)}"\r\n` +
		`Content-Type: audio/${fileExtension}\r\n\r\n`;

	const postDataFields = [
		`\r\n--${boundary}\r\n` +
		`Content-Disposition: form-data; name="model"\r\n\r\n` +
		`whisper-1`,
	];

	const postDataEnd = `\r\n--${boundary}--\r\n`;

	const contentLength = Buffer.byteLength(postDataStart)
		+ Buffer.byteLength(fileContent)
		+ Buffer.byteLength(postDataFields.join(''))
		+ Buffer.byteLength(postDataEnd)
	;

	const options = {
		hostname: 'api.openai.com',
		path: '/v1/audio/transcriptions',
		method: 'POST',
		headers: {
			'Content-Type': `multipart/form-data; boundary=${boundary}`,
			'Authorization': `Bearer ${token}`,
			'Content-Length': contentLength,
		}
	};

	return new Promise((resolve, reject) => {
		const req = https.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => {
				data += chunk;
			});
			res.on('end', () => {
				resolve(data);
			});
		});

		req.on('error', (e) => {
			console.error(e);
			reject(e);
		});

		req.write(postDataStart);
		req.write(fileContent);
		postDataFields.map(field => req.write(field));
		req.write(postDataEnd);

		req.end();
	});
};


export const handler = async (event) => {

	const regionCode = event.Records[0].awsRegion;
	const eventName = event.Records[0].eventName;

	// Force checking only for new objects in bucket
	if (
		!eventName.startsWith('ObjectCreated:CompleteMultipartUpload')
		&& !eventName.startsWith('ObjectCreated:Put')
	) {
		throw new Error('Unexpected event name.');
	}

	// Get Bucket and File names
	const bucket = event.Records[0].s3.bucket.name;
	const fileFullName = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '));
	const resultFileName = `${fileFullName}.txt`;
	const fileBucketObject = {
		Bucket: bucket,
		Key: fileFullName,
	};

	try {

		if (!(await fileIsAudio(fileBucketObject))) {
			return;
		}

		const downloadedFileName = await downloadFile(fileBucketObject);
		const stats = fs.statSync(downloadedFileName);

		console.log(`File was saved to ${downloadedFileName} with size ${stats.size}.`);

		const token = await getToken(regionCode);
		let response = await sendAudioToOpenAI(downloadedFileName, token);

		if (response) {
			response = JSON.parse(response);

			console.log('OpeAI replied succefully.');

			await s3.putObject({
				Bucket: bucket,
				Key: resultFileName,
				ContentType: 'text/plain; charset=utf-8',
				Body: response.text
			});

			console.log(`Transcribe was uploaded successfully in Bucket ${bucket} with name: ${resultFileName}`);
		}

	} catch (err) {
		throw new Error(err);
	}
};
