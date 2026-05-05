pipeline {
  agent any

  environment {
    APP_IMAGE = 'gitrss'
    DOCKER_REGISTRY = "docker.petarmc.com"
    DOCKER_NAMESPACE = "petarmc"
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

    stage('Build Docker Image') {
      steps {
        sh '''
          docker build -f Dockerfile \
            -t ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${APP_IMAGE}:${IMAGE_TAG} \
            -t ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${APP_IMAGE}:latest .
        '''
      }
    }

    stage('Push Docker Image') {
      steps {
        withCredentials([
          usernamePassword(
            credentialsId: 'docker-registry-credentials',
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS'
          )
        ]) {
          sh '''
            echo "$DOCKER_PASS" | docker login ${DOCKER_REGISTRY} -u "$DOCKER_USER" --password-stdin
            docker push ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${APP_IMAGE}:${IMAGE_TAG}
            docker push ${DOCKER_REGISTRY}/${DOCKER_NAMESPACE}/${APP_IMAGE}:latest
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
