pipeline {
  agent any

  environment {
    BACKEND_IMAGE = 'gitrss-backend'
    FRONTEND_IMAGE = 'gitrss-frontend'
    DOCKER_REGISTRY = "docker.petarmc.com"
    DOCKER_NAMESPACE = "petarmc"
    DOCKER_CREDENTIALS_ID = "docker-registry-credentials"
    IMAGE_TAG = "${env.BUILD_NUMBER}"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Setup Tooling') {
      steps {
        sh 'node --version'
        sh 'corepack enable'
        sh 'pnpm --version'
      }
    }

    stage('Install and Build Backend') {
      steps {
        dir('backend') {
          sh 'pnpm install --frozen-lockfile'
          sh 'pnpm build'
        }
      }
    }

    stage('Install and Build Frontend') {
      steps {
        dir('frontend') {
          sh 'pnpm install --frozen-lockfile'
          sh 'pnpm build'
        }
      }
    }

    stage('Build Docker Images') {
      steps {
        sh '''
          docker build -f backend/Dockerfile \
            -t ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${BACKEND_IMAGE}:${IMAGE_TAG} \
            -t ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${BACKEND_IMAGE}:latest .

          docker build -f frontend/Dockerfile \
            -t ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${FRONTEND_IMAGE}:${IMAGE_TAG} \
            -t ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${FRONTEND_IMAGE}:latest .
        '''
      }
    }

    stage('Push Docker Images') {
      when {
        expression { return params.PUSH_IMAGES }
      }
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: params.DOCKER_CREDENTIALS_ID,
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS'
          )
        ]) {
          sh '''
            docker login ${DOCKER_REGISTRY} -u "$DOCKER_USER" --password-stdin
            docker push ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${BACKEND_IMAGE}:${IMAGE_TAG}
            docker push ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${BACKEND_IMAGE}:latest
            
            docker push ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${FRONTEND_IMAGE}:${IMAGE_TAG}
            docker push ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${FRONTEND_IMAGE}:latest
            docker logout ${DOCKER_REGISTRY}
          '''
        }
      }
    }
  }

  post {
    always {
      cleanWs()
    }
  }
}
